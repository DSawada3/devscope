/** Radix UI の選択ボタングループを、アプリ共通の見た目で提供する。 */
import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';

/** 予定／実績、日／週など、選択肢をひとまとまりにする枠。 */
export const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => <ToggleGroupPrimitive.Root ref={ref} className={cn('inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1', className)} {...props} />);
ToggleGroup.displayName = 'ToggleGroup';

/** グループ内の選択肢。Radix UI の選択状態に応じて背景・文字色を変える。 */
export const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => <ToggleGroupPrimitive.Item ref={ref} className={cn('inline-flex h-8 items-center justify-center gap-2 rounded-md px-4 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=on]:bg-white data-[state=on]:text-foreground data-[state=on]:shadow-sm', className)} {...props} />);
ToggleGroupItem.displayName = 'ToggleGroupItem';
