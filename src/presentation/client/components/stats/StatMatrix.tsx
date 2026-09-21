import type { SpeciesMatrix } from '@domain/stats/aggregate';
import './stats.css';

interface Props {
  matrix: SpeciesMatrix;
  memberNames: Map<string, string>;
  speciesNames: Map<string, string>;
}

/**
 * 사람 × 어종 매트릭스 (Plan FR-27, Design §5.4 ⑥).
 *
 * 셀 색 농도로 값을 표현한다. "누가 무슨 고기를 잡았나"를 한 장으로 보여주는 표다.
 * 0은 빈칸으로 둔다 — 0이 가득한 표는 읽기 어렵다.
 */
export function StatMatrix({ matrix, memberNames, speciesNames }: Props) {
  if (matrix.memberIds.length === 0 || matrix.speciesIds.length === 0) {
    return <p class="muted stats__empty">아직 기록이 없어요</p>;
  }

  const max = Math.max(1, ...matrix.rows.flat());

  return (
    <div class="matrix__scroll">
      <table class="matrix">
        <thead>
          <tr>
            <th scope="col" class="matrix__corner">
              <span class="sr-only">참여자</span>
            </th>
            {matrix.speciesIds.map((id) => (
              <th scope="col" key={id} class="matrix__head">
                {speciesNames.get(id) ?? ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.memberIds.map((memberId, r) => (
            <tr key={memberId}>
              <th scope="row" class="matrix__row-head">
                {memberNames.get(memberId) ?? ''}
              </th>
              {matrix.speciesIds.map((speciesId, c) => {
                const value = matrix.rows[r]?.[c] ?? 0;
                return (
                  <td
                    key={speciesId}
                    class="matrix__cell"
                    style={{
                      background:
                        value === 0
                          ? 'transparent'
                          : `rgba(43, 169, 196, ${String(0.15 + (value / max) * 0.65)})`,
                    }}
                  >
                    {value === 0 ? '' : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
