import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { MapPin, Warehouse } from 'lucide-react';
import {
  ALL_AREAS,
  BLASTING_AREA,
  LANE_A,
  LANE_B,
  bayCode,
  bayLabel,
  formatDate,
  groupKeyOf,
  plural,
  zoneOrderFor,
} from './constants';

const OCCUPANCY = [
  { bg: '#ffffff', border: '#e2e8f0', dashed: true },
  { bg: '#caf0f8', border: '#90e0ef' },
  { bg: '#90e0ef', border: '#00b4d8' },
  { bg: '#00b4d8', border: '#0077b6' },
];

const EMPTY_COUNT = Object.freeze({ reservations: 0, activities: 0 });

function laneColumns(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + (Array.isArray(item.bays) ? item.bays.length : 1), 0);
}

function countBay(rows) {
  if (!rows || rows.length === 0) return EMPTY_COUNT;
  const groups = new Set();
  const tasks = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    groups.add(groupKeyOf(row));
    const taskId = row.task_id;
    if (taskId != null && taskId !== '') {
      tasks.add(`${row.project_id == null ? '' : row.project_id}:${taskId}`);
    }
  }
  return { reservations: groups.size, activities: tasks.size };
}

const BayMiniCell = React.memo(function BayMiniCell({ code, reservations, activities, withCode }) {
  const tone = OCCUPANCY[Math.min(reservations, OCCUPANCY.length - 1)];
  const occupied = reservations > 0;

  return (
    <div
      aria-hidden="true"
      title={`${bayLabel(code)} — ${plural(reservations, 'reservation')}, ${plural(activities, 'activity', 'activities')}`}
      className={`flex min-w-0 items-center justify-center overflow-hidden rounded ${
        withCode ? 'h-7 gap-1 px-1' : 'h-9 flex-col'
      } ${tone.dashed ? 'border border-dashed' : 'border'}`}
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      {withCode && (
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide tabular-nums text-slate-500">
          {code}
        </span>
      )}
      {occupied && (
        <>
          <span className="text-xs font-extrabold leading-none tabular-nums text-slate-800">
            {reservations}
          </span>
          {withCode ? (
            <span aria-hidden="true" className="h-3 w-px shrink-0 bg-slate-800/25" />
          ) : (
            <span aria-hidden="true" className="my-0.5 h-px w-3 bg-slate-800/25" />
          )}
          <span className="text-xs font-normal leading-none tabular-nums text-slate-800">
            {activities}
          </span>
        </>
      )}
    </div>
  );
});

const AreaBlock = React.memo(function AreaBlock({
  area,
  schedulesByBay,
  cursorDate,
  selected,
  onSelect,
  layout,
}) {
  const rows = useMemo(() => {
    if (!area.zoned) {
      return [
        {
          zoneKey: null,
          cells: area.bays.map((base) => ({ code: base, ...countBay(schedulesByBay?.get(base)) })),
        },
      ];
    }
    return zoneOrderFor(layout).map((zoneKey) => ({
      zoneKey,
      cells: area.bays.map((base) => {
        const code = bayCode(base, zoneKey);
        return { code, ...countBay(schedulesByBay?.get(code)) };
      }),
    }));
  }, [area, schedulesByBay, layout]);

  const totals = useMemo(
    () =>
      rows
        .flatMap((row) => row.cells)
        .reduce(
          (acc, cell) => ({
            reservations: acc.reservations + cell.reservations,
            activities: acc.activities + cell.activities,
          }),
          { reservations: 0, activities: 0 }
        ),
    [rows]
  );

  const bayCount = rows.reduce((acc, row) => acc + row.cells.length, 0);

  const handleClick = useCallback(() => onSelect(area.areaCode), [onSelect, area.areaCode]);

  const isAside = layout === 'aside';
  const shortName = String(area.areaName || '').replace(/^area\s*/i, '');
  const label = !isAside && area.bays.length <= 2 ? shortName : area.areaName;

  const labelNode = (
    <span
      className={`block h-4 truncate text-[11px] font-semibold uppercase tracking-wide ${
        selected ? 'text-[#0077b6]' : 'text-slate-500'
      }`}
    >
      {label}
    </span>
  );

  const gridNode = (
    <div className="flex flex-col gap-px">
      {rows.map((row, index) => (
        <React.Fragment key={row.zoneKey || 'single'}>
          {}
          {index > 0 && (
            <span aria-hidden="true" className="my-px h-0.5 w-full rounded bg-slate-300" />
          )}
          <div
            className={isAside ? 'grid gap-1' : 'grid gap-px'}
            style={
              isAside
                ? undefined
                : { gridTemplateColumns: `repeat(${area.bays.length}, minmax(0, 1fr))` }
            }
          >
            {row.cells.map((cell) => (
              <BayMiniCell
                key={cell.code}
                code={cell.code}
                reservations={cell.reservations}
                activities={cell.activities}
                withCode={isAside}
              />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selected}
      title={area.areaName}
      aria-label={
        `${area.areaName}: ${plural(bayCount, 'bay')}, ${totals.reservations} reservations, ` +
        `${totals.activities} activities on ${formatDate(cursorDate)}`
      }
      className={`flex min-w-0 flex-col gap-0.5 rounded-lg border p-0.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00b4d8] motion-reduce:transition-none ${
        selected
          ? 'border-[#0077b6] bg-[#eaf8fd] ring-2 ring-[#90e0ef]'
          : 'border-transparent hover:border-[#90e0ef] hover:bg-slate-50'
      } ${isAside ? 'w-full' : ''}`}
      style={isAside ? undefined : { gridColumn: `span ${area.bays.length}` }}
    >
      {layout === 'bottom' ? (
        <>
          {gridNode}
          {labelNode}
        </>
      ) : (
        <>
          {labelNode}
          {gridNode}
        </>
      )}
    </button>
  );
});

const WarehouseBlock = React.memo(function WarehouseBlock({ bays }) {
  return (
    <div
      className="flex min-w-0 flex-col justify-end gap-0.5 rounded-lg border border-transparent p-0.5"
      style={{ gridColumn: `span ${bays.length}` }}
    >
      <div className="flex h-9 min-w-0 items-center justify-center gap-1 rounded border border-slate-200 bg-slate-100 px-1">
        <Warehouse className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide tabular-nums text-slate-500">
          Warehouse B1–B8
        </span>
      </div>
      <span className="block h-4 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Not bookable
      </span>
    </div>
  );
});

function AisleGap() {
  return (
    <div className="flex items-stretch justify-center" aria-hidden="true">
      <div className="my-1 w-px bg-slate-200" />
    </div>
  );
}

const Lane = React.memo(function Lane({
  items,
  columns,
  schedulesByBay,
  cursorDate,
  selectedAreaCode,
  onSelectArea,
}) {
  return (
    <div
      className="grid min-w-0 items-end gap-0.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        if (item.type === 'warehouse') return <WarehouseBlock key="warehouse" bays={item.bays} />;
        if (item.type !== 'area') return <AisleGap key={`aisle-${item.code}`} />;
        return (
          <AreaBlock
            key={item.areaCode}
            area={item}
            schedulesByBay={schedulesByBay}
            cursorDate={cursorDate}
            selected={selectedAreaCode === item.areaCode}
            onSelect={onSelectArea}
            layout={item.label === 'bottom' ? 'bottom' : 'top'}
          />
        );
      })}
    </div>
  );
});

function LegendSwatch({ tone, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-3 w-4 shrink-0 rounded ${tone.dashed ? 'border border-dashed' : 'border'}`}
        style={{ background: tone.bg, borderColor: tone.border }}
      />
      {label}
    </span>
  );
}

export default function FloorMapOverview({
  schedulesByBay,
  cursorDate,
  selectedAreaCode,
  onSelectArea,
}) {
  const selectRef = useRef(onSelectArea);
  useEffect(() => {
    selectRef.current = onSelectArea;
  });
  const handleSelectArea = useCallback((areaCode) => {
    if (typeof selectRef.current === 'function') selectRef.current(areaCode);
  }, []);

  const columns = useMemo(() => Math.max(laneColumns(LANE_A), laneColumns(LANE_B)), []);

  return (
    <section
      aria-label="Floor map"
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
            style={{ background: 'linear-gradient(135deg,#023e8a,#0077b6)' }}
          >
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0077b6]">
              Cikupa Layout
            </p>
            <h3 className="truncate text-sm font-extrabold text-slate-800">Area summary</h3>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#90e0ef] bg-[#caf0f8] px-2 py-1 text-xs font-bold tabular-nums text-[#023e8a]">
          As of {formatDate(cursorDate)}
        </span>
      </div>

      <p className="text-xs text-slate-500">Select an area to see its bays.</p>

      {}
      <div className="flex min-w-0 items-stretch gap-2">
        {}
        <div className="w-[136px] shrink-0">
          <AreaBlock
            area={BLASTING_AREA}
            schedulesByBay={schedulesByBay}
            cursorDate={cursorDate}
            selected={selectedAreaCode === BLASTING_AREA.areaCode}
            onSelect={handleSelectArea}
            layout="aside"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Lane
            items={LANE_A}
            columns={columns}
            schedulesByBay={schedulesByBay}
            cursorDate={cursorDate}
            selectedAreaCode={selectedAreaCode}
            onSelectArea={handleSelectArea}
          />
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300">
              Aisle
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <Lane
            items={LANE_B}
            columns={columns}
            schedulesByBay={schedulesByBay}
            cursorDate={cursorDate}
            selectedAreaCode={selectedAreaCode}
            onSelectArea={handleSelectArea}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-200 pt-2 text-xs font-medium text-slate-600">
        <LegendSwatch tone={OCCUPANCY[0]} label="Free" />
        <LegendSwatch tone={OCCUPANCY[1]} label="1 reservation" />
        <LegendSwatch tone={OCCUPANCY[2]} label="2 reservations" />
        <LegendSwatch tone={OCCUPANCY[3]} label="3+ reservations" />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 shrink-0 rounded border border-slate-200 bg-slate-100" />{' '}
          Warehouse
        </span>
        <span className="text-slate-500">
          <span className="font-extrabold text-slate-800">reservations</span> /{' '}
          <span className="font-normal text-slate-800">activities</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-[#0077b6]" aria-hidden="true" />
          <span className="tabular-nums">{ALL_AREAS.length}</span> areas
        </span>
      </div>
    </section>
  );
}
