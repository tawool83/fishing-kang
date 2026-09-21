import { snackbarStore } from '../view-models/snackbarStore';
import './Snackbar.css';

export function Snackbar() {
  const item = snackbarStore.current.value;
  if (item === null) return null;

  return (
    <div class="snack" role="status" aria-live="polite" key={item.id}>
      <span class="snack__text">{item.text}</span>
      {item.action !== undefined && (
        <button
          type="button"
          class="snack__action"
          onClick={() => {
            const run = item.action?.run;
            snackbarStore.dismiss();
            run?.();
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}
