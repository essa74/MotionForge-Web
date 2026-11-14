import React from 'react';
import {AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Captions} from '../components/Captions';
import {ExcelSheet, sheetWidth, type SheetColumn} from '../components/ExcelSheet';
import {KeyCaps} from '../components/KeyCaps';
import {LogoCapsule} from '../components/LogoCapsule';
import {VoiceOver} from '../components/VoiceOver';
import type {CaptionLine, ReelProps} from '../lib/types';

const columns: SheetColumn[] = [
  {header: 'م', width: 70},
  {header: 'اسم الموظف', width: 260},
  {header: 'القسم', width: 250},
  {header: 'الراتب', width: 170},
];

const rows = [
  ['م', 'اسم الموظف', 'القسم', 'الراتب'],
  ['1', 'أحمد علي', 'الموارد البشرية', '8,500'],
  ['2', 'محمد حسن', 'المبيعات', '7,200'],
  ['3', 'سارة إبراهيم', 'الحسابات', '9,100'],
  ['4', 'منى خالد', 'المشتريات', '6,800'],
  ['5', 'يوسف سمير', 'الإنتاج', '7,900'],
  ['6', 'هدى مصطفى', 'الجودة', '8,200'],
  ['7', 'كريم عادل', 'المخازن', '6,500'],
];

const captions: CaptionLine[] = [
  {text: 'جرّب الاختصار ده في Excel', from: 0.4, to: 2.6},
  {text: 'Ctrl + A بيحدد الجدول كله في لحظة', from: 2.8, to: 6.0},
  {text: 'تابعنا لمزيد من الحيل', from: 6.2, to: 7.6},
];

/** Template reel: use it as the pattern for new reels. Replace data, captions and timings. */
export const TemplateDemo: React.FC<ReelProps> = ({voiceOver, logo}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const scale = (width * 0.92) / sheetWidth(columns);

  const enter = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const progress = interpolate(frame, [1.6 * fps, 2.6 * fps], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const selecting = frame >= 1.4 * fps;

  return (
    <AbsoluteFill style={{background: 'linear-gradient(180deg, #e8efe9 0%, #cfd9d2 100%)'}}>
      <VoiceOver src={voiceOver} />

      <div
        style={{
          position: 'absolute',
          top: height * 0.1,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: enter,
        }}
      >
        <Sequence from={Math.round(1.2 * fps)} layout="none">
          <KeyCaps keys={['Ctrl', 'A']} pressAt={[0, 8]} size={0.085} />
        </Sequence>
      </div>

      <div
        style={{
          position: 'absolute',
          top: height * 0.22,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
        }}
      >
        <ExcelSheet
          columns={columns}
          rows={rows}
          scale={scale}
          rowHeight={84}
          tableHeader
          nameBox={selecting ? 'A1:D8' : 'A1'}
          formula="اسم الموظف"
          selection={
            selecting
              ? {r1: 0, c1: 0, r2: rows.length - 1, c2: columns.length - 1, progress}
              : {r1: 0, c1: 0, r2: 0, c2: 0}
          }
        />
      </div>

      <Captions lines={captions} bottom={0.1} />

      <Sequence from={Math.round(7.2 * fps)}>
        <LogoCapsule logo={logo} />
      </Sequence>
    </AbsoluteFill>
  );
};
