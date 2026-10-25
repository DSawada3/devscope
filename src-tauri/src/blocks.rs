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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct BlockInput {
    title: String,
    start: String,
    end: String,
    mode: String,
    category: String,
    project: String,
    #[serde(default)]
    phase: String,
    note: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WorkBlock {
    id: String,
    #[serde(flatten)]
    input: BlockInput,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TaskInput {
    title: String,
    category: String,
    project: String,
    #[serde(default)]
    phase: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Task {
    id: String,
    #[serde(flatten)]
    input: TaskInput,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CategoryDefinition {
    id: String,
    label: String,
    color: String,
    background: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleImportResult {
    blocks: Vec<WorkBlock>,
    tasks: Vec<Task>,
    categories: Vec<CategoryDefinition>,
    phases: Vec<String>,
    projects: Vec<String>,
    added_blocks: usize,
}
fn default_categories() -> Vec<CategoryDefinition> {
    [
        ("development", "開発", "#408b75", "#e5f1eb"),
        ("design", "設計", "#7d68b3", "#eee9f7"),
        ("review", "レビュー", "#477fab", "#e7eff9"),
        ("meeting", "ミーティング", "#ad8147", "#faf0df"),
    ].into_iter().map(|(id, label, color, background)| CategoryDefinition {
        id: id.into(), label: label.into(), color: color.into(), background: background.into(),
    }).collect()
}
fn validate_task(input: &TaskInput) -> Result<(), ApiError> {
    if input.title.trim().is_empty()
        || input.title.encode_utf16().count() > 100
        || input.project.encode_utf16().count() > 60
        || input.phase.encode_utf16().count() > 60
        || !valid_category(&input.category)
    { return Err(invalid()); }
    Ok(())
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
    phase: Option<String>,
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
    #[serde(default)]
    tasks: Vec<Task>,
    #[serde(default = "initial_task_id")]
    next_task_id: u64,
    #[serde(default)]
    development_phases: Vec<String>,
    #[serde(default)]
    projects: Vec<String>,
    #[serde(default = "default_categories")]
    categories: Vec<CategoryDefinition>,
    #[serde(default = "initial_task_id")]
    next_category_id: u64,
}
fn initial_task_id() -> u64 { 1 }
impl Default for Document {
    fn default() -> Self {
        Self {
            version: 1,
            next_id: 1,
            blocks: Vec::new(),
            tasks: Vec::new(),
            next_task_id: 1,
            development_phases: Vec::new(),
            projects: Vec::new(),
            categories: default_categories(),
            next_category_id: 1,
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
            || !valid_categories(&doc)
            || !valid_registry(&doc.development_phases)
            || !valid_registry(&doc.projects)
            || doc.next_task_id == 0
            || doc.tasks.iter().any(|task| {
                let number = task.id.strip_prefix("task-").and_then(|id| id.parse::<u64>().ok());
                number.is_none_or(|id| id == 0 || id >= doc.next_task_id)
                    || !ids.insert(&task.id)
                    || validate_task(&task.input).is_err()
                    || !doc.categories.iter().any(|category| category.id == task.input.category)
                    || task.input.title != task.input.title.trim()
            })
            || doc.blocks.iter().any(|b| {
                let number =
                    b.id.strip_prefix("block-")
                        .and_then(|id| id.parse::<u64>().ok());
                number.is_none_or(|id| id == 0 || id >= doc.next_id)
                    || !ids.insert(&b.id)
                    || validate(&b.input).is_err()
                    || !doc.categories.iter().any(|category| category.id == b.input.category)
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
        let doc = self.read()?;
        if filter.categories.as_ref().is_some_and(|ids| ids.iter().any(|id| !doc.categories.iter().any(|category| category.id == *id))) { return Err(invalid()); }
        Ok(doc
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
        if !doc.categories.iter().any(|category| category.id == input.category) { return Err(invalid()); }
        let block = WorkBlock {
            id: format!("block-{}", doc.next_id),
            input,
        };
        doc.next_id = doc.next_id.checked_add(1).ok_or_else(storage_error)?;
        doc.blocks.push(block.clone());
        self.write(&doc)?;
        Ok(block)
    }
    fn list_tasks(&self) -> Result<Vec<Task>, ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        Ok(self.read()?.tasks)
    }
    fn import_samples(&self, blocks: Vec<BlockInput>) -> Result<SampleImportResult, ApiError> {
        if blocks.is_empty() || blocks.len() > 64 { return Err(invalid()); }
        let defaults = default_categories();
        for input in &blocks {
            validate(input)?;
            if !defaults.iter().any(|category| category.id == input.category) { return Err(invalid()); }
        }
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        let before = doc.blocks.len();
        for mut input in blocks {
            input.title = input.title.trim().to_owned();
            let definition = defaults.iter().find(|category| category.id == input.category).ok_or_else(invalid)?;
            // 削除した初期カテゴリは補い、同名の登録済みカテゴリがあれば再利用する。
            let category_id = if let Some(category) = doc.categories.iter().find(|category| category.id == definition.id || category.label == definition.label) {
                category.id.clone()
            } else {
                doc.categories.push(definition.clone());
                definition.id.clone()
            };
            input.category = category_id;
            if !doc.tasks.iter().any(|task| task.input.title == input.title && task.input.category == input.category && task.input.project == input.project && task.input.phase == input.phase) {
                let task = Task { id: format!("task-{}", doc.next_task_id), input: TaskInput { title: input.title.clone(), category: input.category.clone(), project: input.project.clone(), phase: input.phase.clone() } };
                doc.next_task_id = doc.next_task_id.checked_add(1).ok_or_else(storage_error)?;
                doc.tasks.push(task);
            }
            if !doc.blocks.iter().any(|block| block.input == input) {
                let block = WorkBlock { id: format!("block-{}", doc.next_id), input };
                doc.next_id = doc.next_id.checked_add(1).ok_or_else(storage_error)?;
                doc.blocks.push(block);
            }
        }
        self.write(&doc)?;
        let phases = registry_entries(&doc, RegistryKind::Phase);
        let projects = registry_entries(&doc, RegistryKind::Project);
        Ok(SampleImportResult { added_blocks: doc.blocks.len() - before, blocks: doc.blocks, tasks: doc.tasks, categories: doc.categories, phases, projects })
    }
    fn create_task(&self, mut input: TaskInput) -> Result<Task, ApiError> {
        input.title = input.title.trim().to_owned();
        validate_task(&input)?;
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        if !doc.categories.iter().any(|category| category.id == input.category) { return Err(invalid()); }
        let task = Task { id: format!("task-{}", doc.next_task_id), input };
        doc.next_task_id = doc.next_task_id.checked_add(1).ok_or_else(storage_error)?;
        doc.tasks.push(task.clone());
        self.write(&doc)?;
        Ok(task)
    }
    fn delete_task(&self, id: String) -> Result<(), ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        let index = doc.tasks.iter().position(|task| task.id == id).ok_or_else(not_found)?;
        doc.tasks.remove(index);
        self.write(&doc)
    }
    fn list_categories(&self) -> Result<Vec<CategoryDefinition>, ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        Ok(self.read()?.categories)
    }
    fn create_category(&self, name: String) -> Result<CategoryDefinition, ApiError> {
        let name = name.trim().to_owned();
        if !valid_name(&name) { return Err(invalid()); }
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        if doc.categories.iter().any(|category| category.label == name) { return Err(error("DUPLICATE_NAME", "同じ名前が既に登録されています。")); }
        let category = CategoryDefinition { id: format!("category-{}", doc.next_category_id), label: name, color: "#408b75".into(), background: "#e5f1eb".into() };
        doc.next_category_id = doc.next_category_id.checked_add(1).ok_or_else(storage_error)?;
        doc.categories.push(category.clone());
        self.write(&doc)?;
        Ok(category)
    }
    fn delete_category(&self, id: String) -> Result<(), ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        let index = doc.categories.iter().position(|category| category.id == id).ok_or_else(not_found)?;
        if doc.tasks.iter().any(|task| task.input.category == id) || doc.blocks.iter().any(|block| block.input.category == id) { return Err(in_use()); }
        doc.categories.remove(index);
        self.write(&doc)
    }
    fn list_registry(&self, kind: RegistryKind) -> Result<Vec<String>, ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        Ok(registry_entries(&self.read()?, kind))
    }
    fn create_registry_entry(&self, kind: RegistryKind, name: String) -> Result<String, ApiError> {
        let name = name.trim().to_owned();
        if !valid_name(&name) { return Err(invalid()); }
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        if registry_entries(&doc, kind).contains(&name) {
            return Err(error("DUPLICATE_NAME", "同じ名前が既に登録されています。"));
        }
        match kind {
            RegistryKind::Phase => doc.development_phases.push(name.clone()),
            RegistryKind::Project => doc.projects.push(name.clone()),
        }
        self.write(&doc)?;
        Ok(name)
    }
    fn delete_registry_entry(&self, kind: RegistryKind, name: String) -> Result<(), ApiError> {
        let _guard = self.gate.lock().map_err(|_| storage_error())?;
        let _file = self.lock_file()?;
        let mut doc = self.read()?;
        if !registry_entries(&doc, kind).contains(&name) { return Err(not_found()); }
        if doc.tasks.iter().any(|task| match kind { RegistryKind::Phase => task.input.phase.trim() == name, RegistryKind::Project => task.input.project.trim() == name })
            || doc.blocks.iter().any(|block| match kind { RegistryKind::Phase => block.input.phase.trim() == name, RegistryKind::Project => block.input.project.trim() == name }) { return Err(in_use()); }
        match kind {
            RegistryKind::Phase => doc.development_phases.retain(|entry| entry != &name),
            RegistryKind::Project => doc.projects.retain(|entry| entry != &name),
        }
        self.write(&doc)
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
        apply!(title, start, end, mode, category, project, phase, note);
        block.input.title = block.input.title.trim().to_owned();
        validate(&block.input)?;
        if !doc.categories.iter().any(|category| category.id == block.input.category) { return Err(invalid()); }
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
#[derive(Clone, Copy)]
enum RegistryKind { Phase, Project }
fn valid_name(name: &str) -> bool {
    !name.is_empty() && name == name.trim() && name.encode_utf16().count() <= 60
}
fn valid_registry(entries: &[String]) -> bool {
    let mut names = std::collections::HashSet::new();
    entries.iter().all(|name| valid_name(name) && names.insert(name))
}
// 過去に自由入力された名前も選択できるよう、保存済み履歴から候補を補う。
fn registry_entries(doc: &Document, kind: RegistryKind) -> Vec<String> {
    let mut entries = match kind {
        RegistryKind::Phase => doc.development_phases.clone(),
        RegistryKind::Project => doc.projects.clone(),
    };
    for name in doc.tasks.iter().map(|task| match kind {
        RegistryKind::Phase => &task.input.phase,
        RegistryKind::Project => &task.input.project,
    }).chain(doc.blocks.iter().map(|block| match kind {
        RegistryKind::Phase => &block.input.phase,
        RegistryKind::Project => &block.input.project,
    })) {
        let name = name.trim().to_owned();
        if !name.is_empty() && !entries.contains(&name) { entries.push(name); }
    }
    entries
}
fn valid_mode(s: &str) -> bool {
    matches!(s, "plan" | "actual")
}
fn valid_category(s: &str) -> bool {
    matches!(s, "development" | "design" | "review" | "meeting")
        || s.strip_prefix("category-").and_then(|id| id.parse::<u64>().ok()).is_some_and(|id| id > 0)
}
fn not_found() -> ApiError { error("NOT_FOUND", "対象が見つかりません。") }
fn in_use() -> ApiError { error("IN_USE", "タスクまたは予定・実績で使用中のため削除できません。") }
fn valid_categories(doc: &Document) -> bool {
    let mut ids = std::collections::HashSet::new();
    let mut labels = std::collections::HashSet::new();
    doc.next_category_id > 0 && doc.categories.iter().all(|category| {
        valid_category(&category.id)
            && category.id.strip_prefix("category-").is_none_or(|id| id.parse::<u64>().is_ok_and(|id| id < doc.next_category_id))
            && ids.insert(&category.id) && labels.insert(&category.label) && valid_name(&category.label)
            && [&category.color, &category.background].iter().all(|color| color.len() == 7 && color.starts_with('#') && color.as_bytes()[1..].iter().all(|byte| byte.is_ascii_hexdigit()))
    })
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
        || input.phase.encode_utf16().count() > 60
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
pub fn import_sample_data(store: tauri::State<'_, BlockStore>, blocks: Vec<BlockInput>) -> Result<SampleImportResult, ApiError> { store.import_samples(blocks) }
#[tauri::command]
pub fn list_categories(store: tauri::State<'_, BlockStore>) -> Result<Vec<CategoryDefinition>, ApiError> { store.list_categories() }
#[tauri::command]
pub fn create_category(store: tauri::State<'_, BlockStore>, name: String) -> Result<CategoryDefinition, ApiError> { store.create_category(name) }
#[tauri::command]
pub fn delete_category(store: tauri::State<'_, BlockStore>, id: String) -> Result<(), ApiError> { store.delete_category(id) }
#[tauri::command]
pub fn delete_task(store: tauri::State<'_, BlockStore>, id: String) -> Result<(), ApiError> { store.delete_task(id) }
#[tauri::command]
pub fn delete_development_phase(store: tauri::State<'_, BlockStore>, name: String) -> Result<(), ApiError> { store.delete_registry_entry(RegistryKind::Phase, name) }
#[tauri::command]
pub fn delete_project(store: tauri::State<'_, BlockStore>, name: String) -> Result<(), ApiError> { store.delete_registry_entry(RegistryKind::Project, name) }
#[tauri::command]
pub fn list_development_phases(store: tauri::State<'_, BlockStore>) -> Result<Vec<String>, ApiError> {
    store.list_registry(RegistryKind::Phase)
}
#[tauri::command]
pub fn create_development_phase(store: tauri::State<'_, BlockStore>, name: String) -> Result<String, ApiError> {
    store.create_registry_entry(RegistryKind::Phase, name)
}
#[tauri::command]
pub fn list_projects(store: tauri::State<'_, BlockStore>) -> Result<Vec<String>, ApiError> {
    store.list_registry(RegistryKind::Project)
}
#[tauri::command]
pub fn create_project(store: tauri::State<'_, BlockStore>, name: String) -> Result<String, ApiError> {
    store.create_registry_entry(RegistryKind::Project, name)
}
#[tauri::command]
pub fn list_tasks(store: tauri::State<'_, BlockStore>) -> Result<Vec<Task>, ApiError> {
    store.list_tasks()
}
#[tauri::command]
pub fn create_task(store: tauri::State<'_, BlockStore>, input: TaskInput) -> Result<Task, ApiError> {
    store.create_task(input)
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
            phase: "".into(),
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
    fn task_input() -> TaskInput {
        TaskInput { title: " タスク ".into(), category: "design".into(), project: "DevScope".into(), phase: "".into() }
    }
    #[test]
    fn sample_import_preserves_data_and_deduplicates_blocks_and_tasks() {
        let s = store();
        let mut original = input();
        original.title = "既存の作業".into();
        let original = s.create(original).unwrap();
        s.delete_category("design".into()).unwrap();
        let category = s.create_category("設計".into()).unwrap();
        s.delete_category("meeting".into()).unwrap();
        let mut plan = input();
        plan.title = " サンプル ".into();
        plan.category = "design".into();
        plan.project = "Demo".into();
        let mut actual = plan.clone();
        actual.mode = "actual".into();
        let mut meeting = plan.clone();
        meeting.title = "会議".into();
        meeting.category = "meeting".into();
        let inputs = vec![plan, actual, meeting];
        let result = s.import_samples(inputs.clone()).unwrap();
        assert_eq!(result.added_blocks, 3);
        assert_eq!(result.blocks.len(), 4);
        assert_eq!(result.blocks[0].id, original.id);
        assert_eq!(result.blocks[0].input.title, "既存の作業");
        assert_eq!(result.tasks.len(), 2);
        assert_eq!(result.blocks[1].input.category, category.id);
        assert!(result.categories.iter().any(|category| category.id == "meeting"));
        assert_eq!(result.projects, vec!["Demo"]);
        let reopened = BlockStore::new(s.path.clone());
        assert_eq!(reopened.import_samples(inputs).unwrap().added_blocks, 0);
        assert_eq!(reopened.list(BlockFilter::default()).unwrap().len(), 4);
        assert_eq!(reopened.list_tasks().unwrap().len(), 2);
        cleanup(&s);
    }
    #[test]
    fn failed_or_invalid_sample_import_leaves_no_partial_data() {
        let s = store();
        s.create(input()).unwrap();
        let before = fs::read(&s.path).unwrap();
        let mut sample = input();
        sample.title = "新しいサンプル".into();
        sample.category = "meeting".into();
        let mut invalid_sample = sample.clone();
        invalid_sample.end = invalid_sample.start.clone();
        assert_eq!(s.import_samples(vec![sample.clone(), invalid_sample]).err().unwrap().code, "VALIDATION_ERROR");
        assert_eq!(s.import_samples(vec![]).err().unwrap().code, "VALIDATION_ERROR");
        assert_eq!(s.import_samples(vec![sample.clone(); 65]).err().unwrap().code, "VALIDATION_ERROR");
        fs::create_dir(s.path.with_extension("json.tmp")).unwrap();
        assert_eq!(s.import_samples(vec![sample]).err().unwrap().code, "STORAGE_ERROR");
        assert_eq!(fs::read(&s.path).unwrap(), before);
        assert!(s.list_tasks().unwrap().is_empty());
        cleanup(&s);
    }
    #[test]
    fn dynamic_categories_validate_references_and_survive_reopening() {
        let s = store();
        let category = s.create_category(" 調査 ".into()).unwrap();
        assert_eq!(category.label, "調査");
        assert_eq!(s.create_category("調査".into()).unwrap_err().code, "DUPLICATE_NAME");
        for name in [" ".to_owned(), "a".repeat(61)] { assert_eq!(s.create_category(name).unwrap_err().code, "VALIDATION_ERROR"); }
        let mut task = task_input();
        task.category = category.id.clone();
        let task = s.create_task(task).unwrap();
        let mut block = input();
        block.category = category.id.clone();
        let block = s.create(block).unwrap();
        assert_eq!(s.delete_category(category.id.clone()).unwrap_err().code, "IN_USE");
        s.delete_task(task.id).unwrap();
        assert_eq!(s.delete_category(category.id.clone()).unwrap_err().code, "IN_USE");
        let reopened = BlockStore::new(s.path.clone());
        assert_eq!(reopened.list(BlockFilter { categories: Some(vec![category.id.clone()]), ..Default::default() }).unwrap().len(), 1);
        s.delete(block.id).unwrap();
        s.delete_category(category.id.clone()).unwrap();
        assert_eq!(s.delete_category(category.id.clone()).unwrap_err().code, "NOT_FOUND");
        let mut invalid_task = task_input();
        invalid_task.category = category.id.clone();
        assert_eq!(s.create_task(invalid_task).unwrap_err().code, "VALIDATION_ERROR");
        let mut invalid_block = input();
        invalid_block.category = category.id;
        assert_eq!(s.create(invalid_block).unwrap_err().code, "VALIDATION_ERROR");
        assert_eq!(reopened.list_categories().unwrap().len(), 4);
        assert_eq!(s.create_category("調査".into()).unwrap().id, "category-2");
        cleanup(&s);
    }
    #[test]
    fn registry_deletion_rejects_usage_and_preserves_block_snapshots() {
        let s = store();
        s.create_registry_entry(RegistryKind::Project, "DevScope".into()).unwrap();
        s.create_registry_entry(RegistryKind::Phase, "設計".into()).unwrap();
        let mut task = task_input();
        task.phase = "設計".into();
        let task = s.create_task(task).unwrap();
        for kind in [RegistryKind::Project, RegistryKind::Phase] {
            let name = match kind { RegistryKind::Project => "DevScope", RegistryKind::Phase => "設計" };
            assert_eq!(s.delete_registry_entry(kind, name.into()).unwrap_err().code, "IN_USE");
        }
        let mut block = input();
        block.project = "DevScope".into();
        block.phase = "設計".into();
        let block = s.create(block).unwrap();
        s.delete_task(task.id.clone()).unwrap();
        assert_eq!(s.delete_task(task.id).unwrap_err().code, "NOT_FOUND");
        assert_eq!(s.list(BlockFilter::default()).unwrap()[0].input.phase, "設計");
        assert_eq!(s.delete_registry_entry(RegistryKind::Phase, "設計".into()).unwrap_err().code, "IN_USE");
        s.delete(block.id).unwrap();
        s.delete_registry_entry(RegistryKind::Phase, "設計".into()).unwrap();
        s.delete_registry_entry(RegistryKind::Project, "DevScope".into()).unwrap();
        let reopened = BlockStore::new(s.path.clone());
        assert!(reopened.list_registry(RegistryKind::Project).unwrap().is_empty());
        assert!(reopened.list_registry(RegistryKind::Phase).unwrap().is_empty());
        assert_eq!(s.delete_registry_entry(RegistryKind::Project, "DevScope".into()).unwrap_err().code, "NOT_FOUND");
        cleanup(&s);
    }
    #[test]
    fn failed_deletions_preserve_saved_lists() {
        let s = store();
        let task = s.create_task(task_input()).unwrap();
        s.create_registry_entry(RegistryKind::Phase, "未使用".into()).unwrap();
        s.create_registry_entry(RegistryKind::Project, "未使用".into()).unwrap();
        let category = s.create_category("未使用".into()).unwrap();
        let before = fs::read(&s.path).unwrap();
        fs::create_dir(s.path.with_extension("json.tmp")).unwrap();
        assert_eq!(s.delete_task(task.id).unwrap_err().code, "STORAGE_ERROR");
        assert_eq!(s.delete_category(category.id).unwrap_err().code, "STORAGE_ERROR");
        assert_eq!(s.delete_registry_entry(RegistryKind::Phase, "未使用".into()).unwrap_err().code, "STORAGE_ERROR");
        assert_eq!(s.delete_registry_entry(RegistryKind::Project, "未使用".into()).unwrap_err().code, "STORAGE_ERROR");
        assert_eq!(fs::read(&s.path).unwrap(), before);
        cleanup(&s);
    }
    #[test]
    fn old_documents_seed_categories_but_deleted_defaults_stay_deleted() {
        let s = store();
        s.create(input()).unwrap();
        let mut legacy: serde_json::Value = serde_json::from_slice(&fs::read(&s.path).unwrap()).unwrap();
        legacy.as_object_mut().unwrap().remove("categories");
        legacy.as_object_mut().unwrap().remove("nextCategoryId");
        fs::write(&s.path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        assert_eq!(s.list_categories().unwrap().len(), 4);
        s.delete_category("meeting".into()).unwrap();
        assert_eq!(BlockStore::new(s.path.clone()).list_categories().unwrap().len(), 3);
        let mut corrupt: serde_json::Value = serde_json::from_slice(&fs::read(&s.path).unwrap()).unwrap();
        corrupt["categories"] = serde_json::json!([]);
        let bytes = serde_json::to_vec(&corrupt).unwrap();
        fs::write(&s.path, &bytes).unwrap();
        assert_eq!(s.create_category("新規".into()).unwrap_err().code, "CORRUPT_DATA");
        assert_eq!(fs::read(&s.path).unwrap(), bytes);
        cleanup(&s);
    }
    #[test]
    fn registry_restores_and_legacy_names_remain_selectable() {
        let s = store();
        s.create(input()).unwrap();
        s.create_task(task_input()).unwrap();
        let mut legacy: serde_json::Value = serde_json::from_slice(&fs::read(&s.path).unwrap()).unwrap();
        legacy.as_object_mut().unwrap().remove("developmentPhases");
        legacy.as_object_mut().unwrap().remove("projects");
        legacy["blocks"][0].as_object_mut().unwrap().remove("phase");
        legacy["tasks"][0].as_object_mut().unwrap().remove("phase");
        fs::write(&s.path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        assert!(s.list_registry(RegistryKind::Phase).unwrap().is_empty());
        assert_eq!(s.list_registry(RegistryKind::Project).unwrap(), vec!["DevScope"]);
        assert_eq!(s.create_registry_entry(RegistryKind::Project, "DevScope".into()).unwrap_err().code, "DUPLICATE_NAME");
        s.create_registry_entry(RegistryKind::Phase, " テスト ".into()).unwrap();
        s.create_registry_entry(RegistryKind::Project, " 新規開発 ".into()).unwrap();
        let mut task = task_input();
        task.phase = "テスト".into();
        task.project = "新規開発".into();
        s.create_task(task).unwrap();
        let mut block = input();
        block.phase = "テスト".into();
        s.create(block).unwrap();
        let reopened = BlockStore::new(s.path.clone());
        assert_eq!(reopened.list_registry(RegistryKind::Phase).unwrap(), vec!["テスト"]);
        assert_eq!(reopened.list_registry(RegistryKind::Project).unwrap(), vec!["新規開発", "DevScope"]);
        assert_eq!(reopened.list_tasks().unwrap()[1].input.phase, "テスト");
        assert_eq!(reopened.list(BlockFilter::default()).unwrap()[1].input.phase, "テスト");
        cleanup(&s);
    }
    #[test]
    fn registry_rejects_invalid_duplicate_and_failed_writes() {
        let s = store();
        for kind in [RegistryKind::Phase, RegistryKind::Project] {
            for name in [" ".to_owned(), "a".repeat(61), "😀".repeat(31)] {
                assert_eq!(s.create_registry_entry(kind, name).unwrap_err().code, "VALIDATION_ERROR");
            }
            s.create_registry_entry(kind, "😀".repeat(30)).unwrap();
            assert_eq!(s.create_registry_entry(kind, "😀".repeat(30)).unwrap_err().code, "DUPLICATE_NAME");
            let before = fs::read(&s.path).unwrap();
            fs::create_dir(s.path.with_extension("json.tmp")).unwrap();
            assert_eq!(s.create_registry_entry(kind, "失敗".into()).unwrap_err().code, "STORAGE_ERROR");
            assert_eq!(fs::read(&s.path).unwrap(), before);
            fs::remove_dir(s.path.with_extension("json.tmp")).unwrap();
        }
        let mut task = task_input();
        task.phase = "a".repeat(61);
        assert_eq!(s.create_task(task).unwrap_err().code, "VALIDATION_ERROR");
        let mut block = input();
        block.phase = "a".repeat(61);
        assert_eq!(s.create(block).unwrap_err().code, "VALIDATION_ERROR");
        cleanup(&s);
    }
    #[test]
    fn corrupt_registry_is_not_overwritten() {
        let s = store();
        s.create_registry_entry(RegistryKind::Phase, "設計".into()).unwrap();
        let mut doc: serde_json::Value = serde_json::from_slice(&fs::read(&s.path).unwrap()).unwrap();
        for entries in [serde_json::json!(["設計", "設計"]), serde_json::json!([" "]), serde_json::json!(["a".repeat(61)])] {
            doc["developmentPhases"] = entries;
            let bytes = serde_json::to_vec(&doc).unwrap();
            fs::write(&s.path, &bytes).unwrap();
            assert_eq!(s.create_registry_entry(RegistryKind::Project, "追加".into()).unwrap_err().code, "CORRUPT_DATA");
            assert_eq!(fs::read(&s.path).unwrap(), bytes);
        }
        cleanup(&s);
    }
    #[test]
    fn tasks_restore_and_preserve_legacy_blocks() {
        let s = store();
        let block = s.create(input()).unwrap();
        let mut legacy: serde_json::Value = serde_json::from_slice(&fs::read(&s.path).unwrap()).unwrap();
        legacy.as_object_mut().unwrap().remove("tasks");
        legacy.as_object_mut().unwrap().remove("nextTaskId");
        fs::write(&s.path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        assert!(s.list_tasks().unwrap().is_empty());
        let task = s.create_task(task_input()).unwrap();
        assert_eq!(task.input.title, "タスク");
        let reopened = BlockStore::new(s.path.clone());
        assert_eq!(reopened.list_tasks().unwrap()[0].id, task.id);
        assert_eq!(reopened.list(BlockFilter::default()).unwrap()[0].id, block.id);
        s.delete(block.id).unwrap();
        assert_eq!(reopened.list_tasks().unwrap().len(), 1);
        cleanup(&s);
    }
    #[test]
    fn invalid_or_failed_task_creation_preserves_storage() {
        let s = store();
        s.create_task(task_input()).unwrap();
        let before = fs::read(&s.path).unwrap();
        for (title, category, project) in [
            (" ".to_owned(), "design".to_owned(), "".to_owned()),
            ("😀".repeat(51), "design".to_owned(), "".to_owned()),
            ("作業".to_owned(), "other".to_owned(), "".to_owned()),
            ("作業".to_owned(), "design".to_owned(), "a".repeat(61)),
        ] {
            assert_eq!(s.create_task(TaskInput { title, category, project, phase: "".into() }).unwrap_err().code, "VALIDATION_ERROR");
        }
        fs::create_dir(s.path.with_extension("json.tmp")).unwrap();
        assert_eq!(s.create_task(task_input()).unwrap_err().code, "STORAGE_ERROR");
        assert_eq!(fs::read(&s.path).unwrap(), before);
        assert_eq!(s.list_tasks().unwrap().len(), 1);
        cleanup(&s);
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
