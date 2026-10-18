/** Radix UI のダイアログに、アプリ共通の背景・配置・閉じるボタンを付ける。 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** ダイアログの開閉状態を管理する親部品。 */
export const Dialog = DialogPrimitive.Root;
/** ダイアログの見出し。支援技術にダイアログ名を伝える。 */
export const DialogTitle = DialogPrimitive.Title;
/** ダイアログの用途を説明する文章。 */
export const DialogDescription = DialogPrimitive.Description;
/** 背景のオーバーレイと、中央に配置する本文・閉じるボタンを描画する。 */
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[2px]" />
    <DialogPrimitive.Content ref={ref} className={cn('fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-white p-7 shadow-2xl focus:outline-none', className)} {...props}>
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="閉じる"><X size={18} /></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';
