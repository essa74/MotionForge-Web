import React from 'react';
import {FONT, brand} from '../lib/theme';

export type SheetColumn = {header: string; width: number};

export type SheetSelection = {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  /** 0..1: grows the selection from its first cell to the full range. */
  progress?: number;
};

type Props = {
  columns: SheetColumn[];
  /** Row 0 is the first sheet row (usually the header row). */
  rows: string[][];
  /** Right-to-left sheet, as in Arabic Excel. */
  rtl?: boolean;
  /** Multiplies every size; the design width is rowNumWidth + sum of column widths. */
  scale?: number;
  rowHeight?: number;
  selection?: SheetSelection | null;
  /** Colour the first row like a table header. */
  tableHeader?: boolean;
  /** Draw darker cell borders on data (gridlines are always drawn). */
  borders?: boolean;
  /** Formula-bar content and name-box text. */
  formula?: string;
  nameBox?: string;
  chrome?: boolean;
  title?: string;
  /** Extra style per cell, keyed "row,col" (0-based). Used for fills, bold and colours. */
  cellStyle?: Record<string, React.CSSProperties>;
};

const ROW_NUM_W = 60;
const TITLE_H = 56;
const TABS_H = 52;
const FORMULA_H = 52;
const COL_HEAD_H = 44;
const TABS = ['الصفحة الرئيسية', 'إدراج', 'تخطيط الصفحة', 'صيغ', 'بيانات', 'مراجعة', 'عرض'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Height of the whole window (chrome + grid) at scale 1. */
export const sheetHeight = (rowCount: number, rowHeight = 46, chrome = true) =>
  (chrome ? TITLE_H + TABS_H + FORMULA_H : 0) + COL_HEAD_H + rowCount * rowHeight + 4;

export const sheetWidth = (columns: SheetColumn[]) => ROW_NUM_W + columns.reduce((sum, c) => sum + c.width, 0);

/** Simulated Excel desktop window. Built from plain divs so it scales to any format. */
export const ExcelSheet: React.FC<Props> = ({
  columns,
  rows,
  rtl = true,
  scale = 1,
  rowHeight = 46,
  selection = null,
  tableHeader = false,
  borders = true,
  formula = '',
  nameBox = 'A1',
  chrome = true,
  title = 'Book1 - Excel',
  cellStyle,
}) => {
  const s = (n: number) => n * scale;
  const totalW = sheetWidth(columns);
  const gridH = COL_HEAD_H + rows.length * rowHeight;
  const edge = rtl ? 'right' : 'left';
  const startBorder = rtl ? 'borderRight' : 'borderLeft';

  const colStart = (c: number) => ROW_NUM_W + columns.slice(0, c).reduce((sum, col) => sum + col.width, 0);

  let selBox: {x: number; y: number; w: number; h: number} | null = null;
  if (selection) {
    const p = selection.progress ?? 1;
    const x1 = colStart(selection.c1);
    const y1 = COL_HEAD_H + selection.r1 * rowHeight;
    const fullW = colStart(selection.c2 + 1) - x1;
    const fullH = (selection.r2 - selection.r1 + 1) * rowHeight;
    const firstW = columns[selection.c1].width;
    selBox = {
      x: x1,
      y: y1,
      w: firstW + (fullW - firstW) * p,
      h: rowHeight + (fullH - rowHeight) * p,
    };
  }

  const cellBase: React.CSSProperties = {
    boxSizing: 'border-box',
    height: s(rowHeight),
    padding: `0 ${s(10)}px`,
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    fontFamily: FONT,
    fontSize: s(rowHeight * 0.42),
    color: brand.ink,
  };

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        width: s(totalW),
        background: brand.paper,
        borderRadius: s(14),
        overflow: 'hidden',
        boxShadow: '0 30px 80px rgba(15,23,42,.35)',
        border: `${s(2)}px solid #c9ced6`,
        fontFamily: FONT,
      }}
    >
      {chrome && (
        <>
          <div
            style={{
              height: s(TITLE_H),
              background: brand.green,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `0 ${s(18)}px`,
              fontWeight: 600,
              fontSize: s(24),
            }}
          >
            <span>{title}</span>
            <span style={{letterSpacing: s(8), opacity: 0.85, direction: 'ltr'}}>— ▢ ✕</span>
          </div>
          <div
            style={{
              height: s(TABS_H),
              background: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              gap: s(22),
              padding: `0 ${s(18)}px`,
              fontSize: s(22),
              color: brand.inkSoft,
              borderBottom: `${s(1)}px solid ${brand.grid}`,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {TABS.map((tab, i) => (
              <span
                key={tab}
                style={{
                  fontWeight: i === 0 ? 700 : 400,
                  color: i === 0 ? brand.green : brand.inkSoft,
                  borderBottom: i === 0 ? `${s(3)}px solid ${brand.green}` : 'none',
                  paddingBottom: s(4),
                }}
              >
                {tab}
              </span>
            ))}
          </div>
          <div
            style={{
              height: s(FORMULA_H),
              display: 'flex',
              alignItems: 'center',
              gap: s(12),
              padding: `0 ${s(14)}px`,
              background: '#fff',
              borderBottom: `${s(1)}px solid ${brand.grid}`,
              fontSize: s(22),
            }}
          >
            <div
              style={{
                width: s(110),
                height: s(34),
                border: `${s(1)}px solid ${brand.grid}`,
                borderRadius: s(4),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                direction: 'ltr',
                color: brand.inkSoft,
              }}
            >
              {nameBox}
            </div>
            <span style={{color: brand.inkSoft, fontStyle: 'italic', direction: 'ltr'}}>fx</span>
            <div style={{flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap'}}>
              {formula}
            </div>
          </div>
        </>
      )}

      <div style={{position: 'relative', width: s(totalW), height: s(gridH), background: '#fff'}}>
        <div style={{display: 'flex', height: s(COL_HEAD_H), background: brand.headerBg}}>
          <div style={{width: s(ROW_NUM_W), borderBottom: `${s(1)}px solid ${brand.grid}`}} />
          {columns.map((col, c) => (
            <div
              key={c}
              style={{
                width: s(col.width),
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: s(22),
                color: brand.inkSoft,
                [startBorder]: `${s(1)}px solid ${brand.grid}`,
                borderBottom: `${s(1)}px solid ${brand.grid}`,
                fontWeight: 600,
              }}
            >
              {LETTERS[c % 26]}
            </div>
          ))}
        </div>

        {rows.map((row, r) => (
          <div key={r} style={{display: 'flex'}}>
            <div
              style={{
                ...cellBase,
                width: s(ROW_NUM_W),
                justifyContent: 'center',
                padding: 0,
                background: brand.headerBg,
                color: brand.inkSoft,
                fontSize: s(20),
                borderBottom: `${s(1)}px solid ${brand.grid}`,
              }}
            >
              {r + 1}
            </div>
            {columns.map((col, c) => {
              const isHead = tableHeader && r === 0;
              return (
                <div
                  key={c}
                  style={{
                    ...cellBase,
                    width: s(col.width),
                    background: isHead ? brand.green : '#fff',
                    color: isHead ? '#fff' : brand.ink,
                    fontWeight: isHead ? 700 : 400,
                    [startBorder]: `${s(1)}px solid ${borders ? '#9aa3af' : brand.grid}`,
                    borderBottom: `${s(1)}px solid ${borders ? '#9aa3af' : brand.grid}`,
                    ...(cellStyle?.[`${r},${c}`] ?? {}),
                  }}
                >
                  {row[c] ?? ''}
                </div>
              );
            })}
          </div>
        ))}

        {selBox && (
          <div
            style={{
              position: 'absolute',
              [edge]: s(selBox.x),
              top: s(selBox.y),
              width: s(selBox.w),
              height: s(selBox.h),
              boxSizing: 'border-box',
              border: `${s(3)}px solid ${brand.select}`,
              background: 'rgba(26, 115, 232, 0.12)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
};
