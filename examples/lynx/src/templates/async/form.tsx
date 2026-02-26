import { useEffect, useRef } from '@lynx-js/react';
import { io } from '@iostore/store';
import { useIO } from '@iostore/lynx';

import type { LynxInputEvent } from '../../types/lynx-events';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type Submission = { name: string; email: string; note: string };
type FormState = { name: string; email: string; note: string };

const formStore = io({
  status: 'idle' as Status,
  error: '',
  form: { name: '', email: '', note: '' } as FormState,
  lastSubmission: null as Submission | null,
});

export function AsyncFormTemplate() {
  const state = useIO(formStore);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = () => {
    const name = formStore.form.name.get().trim();
    const email = formStore.form.email.get().trim();

    if (!name || !email) {
      formStore.status.set('error');
      formStore.error.set('Name and email are required.');
      return;
    }

    formStore.status.set('submitting');
    formStore.error.set('');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (Math.random() < 0.2) {
        formStore.status.set('error');
        formStore.error.set('Submission failed. Please retry.');
        return;
      }

      formStore.lastSubmission.set({
        name,
        email,
        note: formStore.form.note.get().trim(),
      });
      formStore.status.set('success');
    }, 700 + Math.random() * 700);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <view className="card">
      <view className="row between">
        <view>
          <text className="eyebrow">Async</text>
          <text className="card-title">Async Form</text>
          <text className="card-desc">Submit a request with optimistic UI.</text>
        </view>
        <text className="badge">{state.status}</text>
      </view>

      <view className="mt16">
        <input
          className="input"
          value={state.form.name}
          placeholder="Your name"
          bindinput={(event: LynxInputEvent) => formStore.form.name.set(event.detail.value)}
        />
        <input
          className="input mt12"
          value={state.form.email}
          placeholder="Email address"
          bindinput={(event: LynxInputEvent) => formStore.form.email.set(event.detail.value)}
        />
        <input
          className="input mt12"
          value={state.form.note}
          placeholder="What should we know?"
          bindinput={(event: LynxInputEvent) => formStore.form.note.set(event.detail.value)}
        />

        <view className="row between mt12">
          <text className="subtle">
            {state.status === 'submitting' ? 'Submitting request...' : 'We will respond within 24 hours.'}
          </text>
          <view
            className={state.status === 'submitting' ? 'button disabled' : 'button primary'}
            bindtap={submit}
          >
            <text className="button-text">Send request</text>
          </view>
        </view>
      </view>

      <view className="mt12">
        {state.status === 'error' ? (
          <view className="error-box">
            <text className="error-text">{state.error}</text>
          </view>
        ) : null}
        {state.status === 'success' && state.lastSubmission ? (
          <view className="success-box">
            <text className="success-text">
              Thanks {state.lastSubmission.name}! We'll follow up at {state.lastSubmission.email}.
            </text>
          </view>
        ) : null}
      </view>
    </view>
  );
}
