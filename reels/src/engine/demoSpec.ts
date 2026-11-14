import type {ReelSpec} from './spec';

const people = [
  ['م', 'اسم الموظف', 'القسم', 'الراتب'],
  ['1', 'أحمد علي', 'الموارد البشرية', '8,500'],
  ['2', 'محمد حسن', 'المبيعات', '7,200'],
  ['3', 'سارة إبراهيم', 'الحسابات', '9,100'],
  ['4', 'منى خالد', 'المشتريات', '6,800'],
  ['5', 'يوسف سمير', 'الإنتاج', '7,900'],
];

/** Shows every scene type: text, Excel with steps, closing logo. Replace with your own scenes. */
export const demoSpec: ReelSpec = {
  format: 'vertical',
  scenes: [
    {type: 'text', duration: 3, title: 'جمّع الراتب في ثانية', subtitle: 'خدعة صغيرة في Excel', theme: 'dark'},
    {
      type: 'excel',
      duration: 9,
      columns: [70, 260, 250, 170],
      rows: [...people, ['', '', 'الإجمالي', '']],
      caption: [
        {text: 'حدّد عمود الراتب', from: 0.4, to: 2.8},
        {text: 'Ctrl + A بيحدد الجدول كله', from: 3, to: 5.5},
        {text: 'والإجمالي بيتكتب لوحده', from: 5.8, to: 8.6},
      ],
      steps: [
        {at: 0.8, do: 'select', range: 'D2:D6', over: 1},
        {at: 3, do: 'keys', keys: ['Ctrl', 'A'], hold: 2.4},
        {at: 3.2, do: 'select', range: 'A1:D7', over: 1},
        {at: 5.8, do: 'type', cell: 'D7', text: '=SUM(D2:D6)', result: '39,500', over: 1.6},
        {at: 7.6, do: 'format', range: 'C7:D7', fill: '#fff4c2', bold: true},
      ],
    },
    {type: 'logo', duration: 3},
  ],
};
