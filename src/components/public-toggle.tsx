"use client";

export function PublicToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
      <input
        type="checkbox"
        name="is_public"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span>
        <span className="font-medium">公開する</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          オフにすると、自分の本棚にだけ表示されます。
        </span>
      </span>
    </label>
  );
}
