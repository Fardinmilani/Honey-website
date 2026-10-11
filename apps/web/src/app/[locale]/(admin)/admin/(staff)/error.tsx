'use client';
import { useParams } from 'next/navigation';
import { getNamespace } from '@honey/i18n';
export default function AdminError({ reset }: { reset: () => void }) {
  const params = useParams();
  const m = getNamespace(params['locale'] === 'en' ? 'en' : 'fa', 'admin');
  return (
    <div className="admin-message admin-message-error" role="alert">
      <p>{m.genericError}</p>
      <button type="button" onClick={reset}>
        {m.retry}
      </button>
    </div>
  );
}
