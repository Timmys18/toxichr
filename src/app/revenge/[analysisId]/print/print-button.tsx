"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      Сохранить как PDF / печать
    </button>
  );
}
