//! 作業ブロックの検証と JSON 永続化。保存が成功するまで変更を確定しない。
use serde::{Deserialize, Serialize};
use std::{fs, io::Write, path::PathBuf, sync::Mutex};

#[derive(Debug, Serialize)]
pub struct ApiError {
    code: &'static str,
    message: &'static str,
}
fn error(code: &'static str, message: &'static str) -> ApiError {
    ApiError { code, message }
}
fn invalid() -> ApiError {
    error("VALIDATION_ERROR", "入力内容を確認してください。")
}
fn storage_error() -> ApiError {
    error("STORAGE_ERROR", "データを読み書きできませんでした。")
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BlockInput {
    title: String,
    start: String,
    end: String,
    mode: String,
    category: String,
    project: String,
    note: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WorkBlock {
    id: String,
    #[serde(flatten)]
    input: BlockInput,
}
#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BlockPatch {
    title: Option<String>,
    start: Option<String>,
    end: Option<String>,
    mode: Option<String>,
    category: Option<String>,
    project: Option<String>,
    note: Option<String>,
}
#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BlockFilter {
    from: Option<String>,
    to: Option<String>,
    mode: Option<String>,
    categories: Option<Vec<String>>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Document {
    version: u32,
    next_id: u64,
    blocks: Vec<WorkBlock>,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            version: 1,
            next_id: 1,
            blocks: Vec::new(),
        }
    }
}
pub struct BlockStore {
    path: PathBuf,
    gate: Mutex<()>,
}
impl BlockStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            gate: Mutex::new(()),
        }
    }
    fn lock_file(&self) -> Result<fs::File, ApiError> {
        fs::create_dir_all(self.path.parent().ok_or_else(storage_error)?)
            .map_err(|_| storage_error())?;
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.path.with_extension("json.lock"))
            .map_err(|_| storage_error())?;
        file.try_lock().map_err(|e| match e {
            fs::TryLockError::WouldBlock => error(
                "BUSY",
                "別の処理が保存データを使用中です。もう一度お試しください。",
            ),
            fs::TryLockError::Error(_) => storage_error(),
        })?;
        Ok(file)
    }
    fn read(&self) -> Result<Document, ApiError> {
        let bytes = match fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Document::default()),
            Err(_) => return Err(storage_error()),
        };
        let doc: Document = serde_json::from_slice(&bytes).map_err(|_| {
            error(
                "CORRUPT_DATA",
                "保存データの形式が不正です。元のファイルを保全してください。",
            )
        })?;
        if doc.version != 1 {
            return Err(error(
                "UNSUPPORTED_VERSION",
                "保存データのバージョンに対応していません。",
            ));
        }
        let mut ids = std::collections::HashSet::new();
        if doc.next_id == 0
            || doc.blocks.iter().any(|b| {
                let number =
                    b.id.strip_prefix("block-")
                        .and_then(|id| id.parse::<u64>().ok());
                number.is_none_or(|id| id == 0 || id >= doc.next_id)
                    || !ids.insert(&b.id)
                    || validate(&b.input).is_err()
                    || b.input.title != b.input.title.trim()
            })
        {
            return Err(error(
                "CORRUPT_DATA",
                "保存データの内容が不正です。元のファイルを保全してください。",
            ));
        }
        Ok(doc)
    }
    fn write(&self, doc: &Document) -> Result<(), ApiError> {
        let parent = self.path.parent().ok_or_else(storage_error)?;
        fs::create_dir_all(parent).map_err(|_| storage_error())?;
        let temporary = self.path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(doc).map_err(|_| storage_error())?;
        let result = (|| {
            let mut file = fs::File::create(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            drop(file);
            fs::rename(&temporary, &self.path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result.map_err(|_| storage_error())
    }
    fn list(&self, filter: BlockFilter) -> Result<Vec<WorkBlock>, ApiError> {
        if filter.from.as_ref().is_some_and(|s| !valid_datetime(s))
            || filter.to.as_ref().is_some_and(|s| !valid_datetime(s))
            || matches!((&filter.from, &filter.to), (Some(a), Some(b)) if a >= b)
            || filter.mode.as_ref().is_some_and(|s| !valid_mode(s))
            || filter
                .categories
                .as_ref()
                .is_some_and(|cs| cs.iter().any(|s| !valid_category(s)))
        {
            return Err(invalid());
        }
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        Ok(self
            .read()?
            .blocks
            .into_iter()
            .filter(|b| {
                filter.from.as_ref().is_none_or(|s| b.input.end > *s)
                    && filter.to.as_ref().is_none_or(|s| b.input.start < *s)
                    && filter.mode.as_ref().is_none_or(|s| b.input.mode == *s)
                    && filter
                        .categories
                        .as_ref()
                        .is_none_or(|cs| cs.contains(&b.input.category))
            })
            .collect())
    }
    fn create(&self, mut input: BlockInput) -> Result<WorkBlock, ApiError> {
        input.title = input.title.trim().to_owned();
        validate(&input)?;
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        let block = WorkBlock {
            id: format!("block-{}", doc.next_id),
            input,
        };
        doc.next_id = doc.next_id.checked_add(1).ok_or_else(storage_error)?;
        doc.blocks.push(block.clone());
        self.write(&doc)?;
        Ok(block)
    }
    fn update(&self, id: String, patch: BlockPatch) -> Result<WorkBlock, ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        let block = doc
            .blocks
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| error("NOT_FOUND", "対象の作業が見つかりません。"))?;
        macro_rules! apply { ($($field:ident),*) => { $(if let Some(value) = patch.$field { block.input.$field = value; })* }; }
        apply!(title, start, end, mode, category, project, note);
        block.input.title = block.input.title.trim().to_owned();
        validate(&block.input)?;
        let result = block.clone();
        self.write(&doc)?;
        Ok(result)
    }
    fn delete(&self, id: String) -> Result<(), ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        let index = doc
            .blocks
            .iter()
            .position(|b| b.id == id)
            .ok_or_else(|| error("NOT_FOUND", "対象の作業が見つかりません。"))?;
        doc.blocks.remove(index);
        self.write(&doc)
    }
}
fn valid_mode(s: &str) -> bool {
    matches!(s, "plan" | "actual")
}
fn valid_category(s: &str) -> bool {
    matches!(s, "development" | "design" | "review" | "meeting")
}
// タイムゾーン変換を行わず、実在する暦日・時分と固定長の形式を検証する。
fn valid_datetime(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 16
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b.iter()
            .enumerate()
            .any(|(i, c)| ![4, 7, 10, 13].contains(&i) && !c.is_ascii_digit())
    {
        return false;
    }
    let year = s[0..4].parse::<u32>().unwrap();
    let month = s[5..7].parse::<usize>().unwrap();
    let day = s[8..10].parse::<u32>().unwrap();
    let hour = s[11..13].parse::<u32>().unwrap();
    let minute = s[14..16].parse::<u32>().unwrap();
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    year > 0
        && (1..=12).contains(&month)
        && day > 0
        && day <= days[month - 1]
        && hour < 24
        && minute < 60
}
fn validate(input: &BlockInput) -> Result<(), ApiError> {
    // HTML の maxlength と同じ UTF-16 コード単位で数える。
    if input.title.trim().is_empty()
        || input.title.encode_utf16().count() > 100
        || input.project.encode_utf16().count() > 60
        || input.note.encode_utf16().count() > 2000
        || !valid_datetime(&input.start)
        || !valid_datetime(&input.end)
        || input.start >= input.end
        || !valid_mode(&input.mode)
        || !valid_category(&input.category)
    {
        return Err(invalid());
    }
    Ok(())
}

#[tauri::command]
pub fn list_work_blocks(
    store: tauri::State<'_, BlockStore>,
    filter: Option<BlockFilter>,
) -> Result<Vec<WorkBlock>, ApiError> {
    store.list(filter.unwrap_or_default())
}
#[tauri::command]
pub fn create_work_block(
    store: tauri::State<'_, BlockStore>,
    input: BlockInput,
) -> Result<WorkBlock, ApiError> {
    store.create(input)
}
#[tauri::command]
pub fn update_work_block(
    store: tauri::State<'_, BlockStore>,
    id: String,
    patch: BlockPatch,
) -> Result<WorkBlock, ApiError> {
    store.update(id, patch)
}
#[tauri::command]
pub fn delete_work_block(store: tauri::State<'_, BlockStore>, id: String) -> Result<(), ApiError> {
    store.delete(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> BlockInput {
        BlockInput {
            title: " 作業 ".into(),
            start: "2026-10-14T09:00".into(),
            end: "2026-10-14T10:00".into(),
            mode: "plan".into(),
            category: "development".into(),
            project: "".into(),
            note: "".into(),
        }
    }
    fn store() -> BlockStore {
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "devscope-test-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        BlockStore::new(dir.join("blocks.json"))
    }
    fn cleanup(s: &BlockStore) {
        fs::remove_dir_all(s.path.parent().unwrap()).unwrap();
    }
    #[test]
    fn crud_survives_reopening_and_filters_overlap() {
        let s = store();
        assert!(s.list(BlockFilter::default()).unwrap().is_empty());
        let block = s.create(input()).unwrap();
        assert_eq!(block.input.title, "作業");
        let reopened = BlockStore::new(s.path.clone());
        assert_eq!(reopened.list(BlockFilter::default()).unwrap().len(), 1);
        for (from, to, count) in [
            ("2026-10-14T08:00", "2026-10-14T09:00", 0),
            ("2026-10-14T09:30", "2026-10-14T09:45", 1),
            ("2026-10-14T10:00", "2026-10-14T11:00", 0),
        ] {
            assert_eq!(
                s.list(BlockFilter {
                    from: Some(from.into()),
                    to: Some(to.into()),
                    ..Default::default()
                })
                .unwrap()
                .len(),
                count
            );
        }
        assert!(s
            .list(BlockFilter {
                mode: Some("actual".into()),
                ..Default::default()
            })
            .unwrap()
            .is_empty());
        assert!(s
            .list(BlockFilter {
                categories: Some(vec![]),
                ..Default::default()
            })
            .unwrap()
            .is_empty());
        s.update(
            block.id.clone(),
            BlockPatch {
                note: Some("更新".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(
            reopened.list(BlockFilter::default()).unwrap()[0].input.note,
            "更新"
        );
        assert_eq!(
            s.update(
                block.id.clone(),
                BlockPatch {
                    end: Some("2026-10-14T08:00".into()),
                    ..Default::default()
                }
            )
            .unwrap_err()
            .code,
            "VALIDATION_ERROR"
        );
        assert_eq!(
            reopened.list(BlockFilter::default()).unwrap()[0].input.end,
            "2026-10-14T10:00"
        );
        s.delete(block.id.clone()).unwrap();
        assert!(reopened.list(BlockFilter::default()).unwrap().is_empty());
        assert_eq!(s.delete(block.id).unwrap_err().code, "NOT_FOUND");
        cleanup(&s);
    }
    #[test]
    fn rejects_invalid_input_and_calendar_dates() {
        for date in [
            "2026-02-29T09:00",
            "2026-04-31T09:00",
            "2026-00-01T09:00",
            "2026-01-01T24:00",
            "0000-01-01T09:00",
            "2026-10-14T09:00Z",
            "あ",
        ] {
            assert!(!valid_datetime(date), "{date}");
        }
        assert!(valid_datetime("2024-02-29T23:59"));
        let s = store();
        for (field, value) in [
            ("title", " "),
            ("mode", "other"),
            ("category", "other"),
            ("end", "2026-10-14T09:00"),
        ] {
            let mut value_json = serde_json::to_value(input()).unwrap();
            value_json[field] = value.into();
            assert_eq!(
                s.create(serde_json::from_value(value_json).unwrap())
                    .unwrap_err()
                    .code,
                "VALIDATION_ERROR"
            );
        }
        let mut long = input();
        long.title = "😀".repeat(51);
        assert!(s.create(long).is_err());
        assert!(s
            .list(BlockFilter {
                from: Some("bad".into()),
                ..Default::default()
            })
            .is_err());
        assert!(!s.path.exists());
    }
    #[test]
    fn competing_store_cannot_write_until_lock_released() {
        let s = store();
        let lock = s.lock_file().unwrap();
        let other = BlockStore::new(s.path.clone());
        assert_eq!(other.create(input()).unwrap_err().code, "BUSY");
        drop(lock);
        other.create(input()).unwrap();
        cleanup(&s);
    }
    #[test]
    fn corrupt_or_unwritable_storage_is_not_overwritten() {
        let s = store();
        fs::create_dir_all(s.path.parent().unwrap()).unwrap();
        fs::write(&s.path, b"broken").unwrap();
        assert_eq!(s.create(input()).unwrap_err().code, "CORRUPT_DATA");
        assert_eq!(fs::read(&s.path).unwrap(), b"broken");
        fs::remove_file(&s.path).unwrap();
        let block = s.create(input()).unwrap();
        let before = fs::read(&s.path).unwrap();
        fs::create_dir(s.path.with_extension("json.tmp")).unwrap();
        assert_eq!(
            s.update(
                block.id,
                BlockPatch {
                    title: Some("失敗".into()),
                    ..Default::default()
                }
            )
            .unwrap_err()
            .code,
            "STORAGE_ERROR"
        );
        assert_eq!(fs::read(&s.path).unwrap(), before);
        cleanup(&s);
    }
}
