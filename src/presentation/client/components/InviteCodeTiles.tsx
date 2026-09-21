import { CODE_LENGTH, normalizeCodeInput } from '@domain/rules/inviteCode';
import './InviteCodeTiles.css';

interface DisplayProps {
  mode: 'display';
  code: string;
  onCopy?: () => void;
}

interface InputProps {
  mode: 'input';
  code: string;
  onChange: (code: string) => void;
  autoFocus?: boolean;
}

type Props = DisplayProps | InputProps;

/**
 * 6칸 초대코드 타일 (Plan FR-01, FR-02).
 *
 * Design Ref: §5.4 ②③ — 표시와 입력 양쪽에서 같은 모양을 쓴다.
 *
 * 입력은 **칸 6개를 따로 두지 않고** 투명한 단일 input 위에 타일을 그린다.
 * 칸마다 input을 두면 iOS에서 자동완성·붙여넣기·백스페이스가 전부 깨진다.
 *
 * 대문자 변환과 혼동 문자 제거는 도메인의 `normalizeCodeInput`이 한다 —
 * 화면이 규칙을 따로 갖지 않는다.
 */
export function InviteCodeTiles(props: Props) {
  const chars = [...props.code.padEnd(CODE_LENGTH, ' ')].slice(0, CODE_LENGTH);

  if (props.mode === 'display') {
    return (
      <button
        type="button"
        class="tiles tiles--display"
        onClick={props.onCopy}
        aria-label={`초대코드 ${[...props.code].join(' ')}, 눌러서 복사`}
      >
        {chars.map((ch, i) => (
          <span class="tiles__tile" key={i} aria-hidden="true">
            {ch.trim()}
          </span>
        ))}
      </button>
    );
  }

  return (
    <div class="tiles tiles--input">
      <label class="sr-only" for="invite-code">
        초대코드 6자리
      </label>
      <input
        id="invite-code"
        class="tiles__input"
        value={props.code}
        onInput={(e) => {
          props.onChange(normalizeCodeInput((e.target as HTMLInputElement).value));
        }}
        inputMode="text"
        autocomplete="one-time-code"
        autocapitalize="characters"
        spellcheck={false}
        maxLength={CODE_LENGTH}
        autofocus={props.autoFocus ?? false}
      />
      {chars.map((ch, i) => (
        <span
          class={`tiles__tile ${i === props.code.length ? 'tiles__tile--active' : ''}`}
          key={i}
          aria-hidden="true"
        >
          {ch.trim()}
        </span>
      ))}
    </div>
  );
}
