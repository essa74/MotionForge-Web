import type {
  Scene,
  SceneLayer,
  ProjectAsset,
  ProjectCategory,
} from './projectTypes'

export interface ScenePlanningInput {
  idea: string
  script?: string
  category: ProjectCategory
  totalDuration?: number
  maxScenes?: number
}

export interface SceneDraft {
  title: string
  description: string
  narration: string
  duration: number
  visualPrompt?: string
  cameraDirection?: string
  characterAction?: string
  visualStyle?: string
  background?: string
  transition?: string
  mood?: string
}

interface SceneTemplate {
  title: string
  purpose: string
  visualDirection: string
  camera: string
  action: string
  mood: string
}

const CATEGORY_TEMPLATES: Record<ProjectCategory, SceneTemplate[]> = {
  auto: [
    {
      title: 'الافتتاحية',
      purpose: 'جذب انتباه المشاهد وتقديم الفكرة المحورية',
      visualDirection: 'لقطة افتتاحية تكشف العنصر الرئيسي للموضوع',
      camera: 'تقريب تدريجي نحو العنصر الرئيسي',
      action: 'ظهور العنصر الرئيسي تدريجيًا',
      mood: 'تشويقي',
    },
    {
      title: 'بناء السياق',
      purpose: 'شرح الخلفية والظروف المحيطة بالموضوع',
      visualDirection: 'لقطة أوسع توضح المكان والأطراف والعلاقات',
      camera: 'لقطة متوسطة ثم انتقال إلى لقطة واسعة',
      action: 'ظهور العناصر المحيطة بالتتابع',
      mood: 'توضيحي',
    },
    {
      title: 'التطور الرئيسي',
      purpose: 'عرض أهم حدث أو تفصيل في الموضوع',
      visualDirection: 'مشهد يوضح الحدث أو العلاقة الأساسية',
      camera: 'حركة جانبية خفيفة تتبع الحدث',
      action: 'تفاعل العناصر مع بعضها',
      mood: 'مركز',
    },
    {
      title: 'الخلاصة',
      purpose: 'تقديم النتيجة النهائية والرسالة',
      visualDirection: 'لقطة ختامية بسيطة تبرز الفكرة الأساسية',
      camera: 'ابتعاد تدريجي يكشف التكوين الكامل',
      action: 'استقرار العناصر على التكوين النهائي',
      mood: 'هادئ',
    },
  ],

  educational: [
    {
      title: 'السؤال أو المشكلة',
      purpose: 'تحديد المشكلة التي يريد المشاهد فهمها',
      visualDirection: 'عرض مثال واضح للمشكلة قبل الحل',
      camera: 'لقطة قريبة على موضع المشكلة',
      action: 'إظهار المشكلة ثم إبراز موضع الخطأ',
      mood: 'فضولي',
    },
    {
      title: 'فهم الفكرة',
      purpose: 'تفسير المبدأ أو المفهوم الأساسي',
      visualDirection: 'رسم توضيحي مبسط يشرح المفهوم',
      camera: 'لقطة ثابتة مع تقريب على التفاصيل',
      action: 'ظهور الأجزاء التوضيحية بالتتابع',
      mood: 'تعليمي',
    },
    {
      title: 'التطبيق العملي',
      purpose: 'عرض كيفية تطبيق الفكرة',
      visualDirection: 'محاكاة عملية للخطوات والنتيجة',
      camera: 'متابعة بصرية لحركة العناصر',
      action: 'تنفيذ الخطوات واحدة بعد الأخرى',
      mood: 'عملي',
    },
    {
      title: 'النتيجة والخلاصة',
      purpose: 'تثبيت المعلومة وإظهار النتيجة',
      visualDirection: 'مقارنة بصرية بين الحالة الأولى والنتيجة',
      camera: 'لقطة واسعة للمقارنة',
      action: 'ظهور النتيجة النهائية بوضوح',
      mood: 'مطمئن',
    },
  ],

  historical: [
    {
      title: 'الزمان والمكان',
      purpose: 'تحديد الحقبة والموقع والسياق التاريخي',
      visualDirection: 'إعادة بناء المكان والبيئة التاريخية',
      camera: 'لقطة سينمائية واسعة',
      action: 'ظهور المكان والعناصر التاريخية',
      mood: 'ملحمي',
    },
    {
      title: 'الأسباب والبداية',
      purpose: 'شرح الأطراف والدوافع وبداية الأحداث',
      visualDirection: 'مشهد يعرض الشخصيات والمكان وبداية الحدث',
      camera: 'لقطة متوسطة تتبع الشخصيات',
      action: 'تحرك الشخصيات وبدء الأحداث',
      mood: 'درامي',
    },
    {
      title: 'الحدث المحوري',
      purpose: 'تقديم نقطة التحول الرئيسية',
      visualDirection: 'إعادة بناء الحدث الأساسي بصورة سينمائية',
      camera: 'حركة سينمائية تتناسب مع طبيعة الحدث',
      action: 'تنفيذ الفعل الرئيسي وردود الفعل',
      mood: 'متوتر',
    },
    {
      title: 'النتائج والإرث',
      purpose: 'توضيح النتائج والأثر التاريخي',
      visualDirection: 'مشهد يوضح ما تغير بعد الحدث',
      camera: 'ابتعاد تدريجي يكشف حجم التأثير',
      action: 'إظهار النتائج والعناصر المتبقية',
      mood: 'تأملي',
    },
  ],

  documentary: [
    {
      title: 'المشهد الافتتاحي',
      purpose: 'تقديم موضوع الوثائقي والسؤال الرئيسي',
      visualDirection: 'لقطة واقعية تكشف موضوع الوثائقي',
      camera: 'لقطة واسعة ثم اقتراب هادئ',
      action: 'كشف المكان أو العنصر الأساسي',
      mood: 'استكشافي',
    },
    {
      title: 'الخلفية والسياق',
      purpose: 'شرح البيئة والظروف المحيطة',
      visualDirection: 'لقطات سياقية ومكانية',
      camera: 'انتقال بين اللقطات التوضيحية',
      action: 'عرض المعلومات والعناصر المرتبطة',
      mood: 'موضوعي',
    },
    {
      title: 'الأدلة والتفاصيل',
      purpose: 'عرض المعلومات والشواهد الأساسية',
      visualDirection: 'تفاصيل قريبة ورسوم بيانات داعمة',
      camera: 'لقطات قريبة على التفاصيل',
      action: 'إبراز المعلومات بالتتابع',
      mood: 'تحليلي',
    },
    {
      title: 'الاستنتاج',
      purpose: 'ربط المعلومات وتقديم خلاصة متوازنة',
      visualDirection: 'لقطة تلخص النتائج الأساسية',
      camera: 'لقطة ثابتة وهادئة',
      action: 'تجميع العناصر في صورة واحدة',
      mood: 'تأملي',
    },
  ],

  storytelling: [
    {
      title: 'تقديم الشخصية',
      purpose: 'تعريف المشاهد بالشخصية والهدف',
      visualDirection: 'لقطة تأسيسية للشخصية ومحيطها',
      camera: 'لقطة متوسطة للشخصية',
      action: 'ظهور الشخصية والتعبير عن حالتها',
      mood: 'إنساني',
    },
    {
      title: 'العقبة والتصاعد',
      purpose: 'إظهار المشكلة والعقبات',
      visualDirection: 'مشهد يوضح تغير الموقف وتصاعد التوتر',
      camera: 'تقريب تدريجي على الشخصية',
      action: 'ظهور العقبة وتغير تعبير الشخصية',
      mood: 'متوتر',
    },
    {
      title: 'اللحظة الحاسمة',
      purpose: 'عرض القرار أو المواجهة الأساسية',
      visualDirection: 'لقطة مركزة على الفعل ورد الفعل',
      camera: 'لقطة قريبة',
      action: 'تنفيذ القرار وإظهار نتيجته',
      mood: 'درامي',
    },
    {
      title: 'الحل والنهاية',
      purpose: 'عرض نتيجة القصة والرسالة',
      visualDirection: 'مشهد ختامي يعكس التحول الذي حدث',
      camera: 'ابتعاد تدريجي',
      action: 'استقرار الشخصية في الوضع النهائي',
      mood: 'عاطفي',
    },
  ],

  marketing: [
    {
      title: 'لفت الانتباه',
      purpose: 'إظهار المشكلة أو الحاجة لدى الجمهور',
      visualDirection: 'عرض موقف يوضح المشكلة',
      camera: 'لقطة قريبة سريعة',
      action: 'إظهار المشكلة بوضوح',
      mood: 'جاذب',
    },
    {
      title: 'تقديم الحل',
      purpose: 'تقديم المنتج أو الخدمة',
      visualDirection: 'عرض المنتج أو الخدمة أثناء الاستخدام',
      camera: 'لقطة واضحة للمنتج',
      action: 'إظهار المنتج وطريقة استخدامه',
      mood: 'إيجابي',
    },
    {
      title: 'إثبات القيمة',
      purpose: 'إبراز الفوائد والمميزات',
      visualDirection: 'مقارنة عملية أو عرض للمميزات',
      camera: 'لقطات قريبة للتفاصيل',
      action: 'ظهور المميزات واحدة تلو الأخرى',
      mood: 'مقنع',
    },
    {
      title: 'الدعوة للإجراء',
      purpose: 'تحديد الخطوة التالية للمشاهد',
      visualDirection: 'شاشة ختامية بهوية العلامة',
      camera: 'تكوين ثابت وواضح',
      action: 'إظهار الرسالة النهائية',
      mood: 'مباشر',
    },
  ],

  scientific: [
    {
      title: 'السؤال العلمي',
      purpose: 'طرح الظاهرة أو السؤال العلمي',
      visualDirection: 'محاكاة توضح الظاهرة',
      camera: 'لقطة تأسيسية واسعة',
      action: 'ظهور الظاهرة بصورة واضحة',
      mood: 'فضولي',
    },
    {
      title: 'الآلية والتفسير',
      purpose: 'شرح العمليات والعوامل المؤثرة',
      visualDirection: 'رسم علمي أو محاكاة توضيحية',
      camera: 'تقريب على أجزاء الآلية',
      action: 'تتابع العمليات والعلاقات',
      mood: 'تحليلي',
    },
    {
      title: 'التأثيرات والنتائج',
      purpose: 'عرض النتائج والتأثيرات',
      visualDirection: 'مقارنة بين الحالات المختلفة',
      camera: 'انتقال بين النتائج',
      action: 'إظهار التغيرات بالتتابع',
      mood: 'استكشافي',
    },
    {
      title: 'الاستنتاج',
      purpose: 'تلخيص النتيجة العلمية',
      visualDirection: 'ملخص بصري للنتيجة',
      camera: 'لقطة ثابتة',
      action: 'تجميع النتائج في تكوين واحد',
      mood: 'توضيحي',
    },
  ],

  social: [
    {
      title: 'الخطاف',
      purpose: 'إيقاف التمرير وخلق الفضول',
      visualDirection: 'موقف بصري مفاجئ أو سؤال واضح',
      camera: 'لقطة قريبة ومباشرة',
      action: 'ظهور الشخصية أو العنصر بشكل مفاجئ',
      mood: 'تشويقي',
    },
    {
      title: 'الفكرة الأساسية',
      purpose: 'توضيح الرسالة الرئيسية',
      visualDirection: 'مشهد بسيط يشرح الفكرة',
      camera: 'لقطة متوسطة',
      action: 'تفاعل الشخصية مع الموقف',
      mood: 'إنساني',
    },
    {
      title: 'التفصيل الأهم',
      purpose: 'إضافة مثال أو تفصيل يوضح الرسالة',
      visualDirection: 'مثال بصري أو مقارنة',
      camera: 'لقطة قريبة على التفاصيل',
      action: 'ظهور الرمز أو العنصر الداعم',
      mood: 'تأملي',
    },
    {
      title: 'الخاتمة والتفاعل',
      purpose: 'إنهاء الرسالة ودعوة المشاهد للتفاعل',
      visualDirection: 'لقطة ختامية برسالة واضحة',
      camera: 'تكوين ثابت',
      action: 'ظهور الرسالة النهائية',
      mood: 'ملهم',
    },
  ],
}

const BETWEEN_LINES_KEYWORDS = [
  'بين السطور',
  'علاقة',
  'العلاقات',
  'التجاهل',
  'الخذلان',
  'الحب',
  'الوحدة',
  'الناس',
  'الصمت',
  'التفكير',
  'القلق',
  'النفسية',
  'مشاعر',
  'مشاعرنا',
  'المواقف',
  'الندم',
  'التقدير',
  'الاحترام',
  'الثقة',
  'الغيرة',
  'الضغط',
  'الشغل',
  'العمل',
  'الأسرة',
  'الأصدقاء',
  'الصداقة',
  'التعلق',
  'الغياب',
  'الاهتمام',
  'المقارنة',
  'الذكريات',
  'الاعتذار',
  'الخوف',
  'الرفض',
]

const OBJECT_KEYWORDS: Array<{
  words: string[]
  object: string
  action: string
}> = [
  {
    words: ['هاتف', 'موبايل', 'رسالة', 'اتصال', 'واتساب'],
    object: 'هاتف محمول تظهر عليه رسالة أو إشعار',
    action: 'تنظر الشخصية إلى الهاتف ثم تتغير تعبيرات وجهها',
  },
  {
    words: ['قلب', 'حب', 'علاقة', 'مشاعر', 'تعلق'],
    object: 'قلب رمزي بسيط باللون الذهبي أو الأحمر',
    action: 'يظهر القلب بين الشخصيات ثم يتغير موضعه أو حالته',
  },
  {
    words: ['ساعة', 'وقت', 'انتظار', 'تأخير'],
    object: 'ساعة حائط أو ساعة يد بسيطة',
    action: 'تتحرك عقارب الساعة بينما تنتظر الشخصية',
  },
  {
    words: ['باب', 'رحيل', 'غياب', 'اختفاء'],
    object: 'باب بسيط في خلفية داكنة',
    action: 'تتحرك شخصية نحو الباب ثم يظل المكان فارغًا',
  },
  {
    words: ['سرير', 'نوم', 'ليل', 'قبل النوم'],
    object: 'سرير بسيط ونافذة ليلية',
    action: 'تستلقي الشخصية ثم تظهر حولها رموز التفكير',
  },
  {
    words: ['فلوس', 'مال', 'مصروف', 'راتب'],
    object: 'مجموعة أوراق نقدية أو محفظة رمزية',
    action: 'تنظر الشخصية إلى المحفظة ثم إلى الأشياء المطلوبة',
  },
  {
    words: ['شغل', 'عمل', 'وظيفة', 'مدير'],
    object: 'مكتب وكرسي وأوراق عمل',
    action: 'تجلس الشخصية أمام المكتب وتتعامل مع الأوراق',
  },
  {
    words: ['طريق', 'قرار', 'اختيار', 'مستقبل'],
    object: 'طريق يتفرع إلى اتجاهين',
    action: 'تقف الشخصية أمام الطريق وتحاول الاختيار',
  },
  {
    words: ['دموع', 'بكاء', 'حزن'],
    object: 'دمعة صغيرة بجوار وجه الشخصية',
    action: 'ينخفض رأس الشخصية وتتغير ملامحها إلى الحزن',
  },
  {
    words: ['صحاب', 'أصدقاء', 'ناس', 'مجموعة'],
    object: 'مجموعة من شخصيات Stick Figures',
    action: 'تقترب الشخصيات من بعضها أو تبتعد حسب الموقف',
  },
]

function containsKeyword(text: string, words: string[]): boolean {
  const normalized = text.toLowerCase()
  return words.some((word) => normalized.includes(word))
}

function isBetweenLines(idea: string, category: ProjectCategory): boolean {
  return category === 'social' || containsKeyword(idea, BETWEEN_LINES_KEYWORDS)
}

function getBetweenLinesStyle(text: string): {
  object: string
  action: string
  mood: string
} {
  const match = OBJECT_KEYWORDS.find((item) =>
    containsKeyword(text, item.words),
  )

  return {
    object: match?.object ?? 'شخصية Stick Figure بيضاء في موقف إنساني بسيط',
    action: match?.action ?? 'تتحرك الشخصية بإيماءات بسيطة تعبر عن الموقف',
    mood: 'إنساني وتأملي',
  }
}

function getTemplates(category: ProjectCategory): SceneTemplate[] {
  return CATEGORY_TEMPLATES[category] ?? CATEGORY_TEMPLATES.auto
}

function splitScript(script: string): string[] {
  return (script.match(/[^.!؟?\n]+[.!؟?]?/g) ?? [])
    .map((part) => part.trim())
    .filter(Boolean)
}

function groupSentences(sentences: string[], maxScenes: number): string[] {
  if (sentences.length === 0) return []

  const sceneCount = Math.min(maxScenes, sentences.length)

  const groups: string[][] = Array.from({ length: sceneCount }, () => [])

  sentences.forEach((sentence, index) => {
    const groupIndex = Math.min(
      Math.floor((index * sceneCount) / sentences.length),
      sceneCount - 1,
    )
    groups[groupIndex].push(sentence)
  })

  return groups.map((group) => group.join(' '))
}

function estimateDuration(text: string): number {
  if (!text.trim()) return 4
  return Math.max(3, text.length / 14)
}

function distributeDurations(
  groups: string[],
  totalDuration?: number,
): number[] {
  if (groups.length === 0) return []

  const weights = groups.map((text) => Math.max(text.length, 20))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

  const estimatedTotal = groups.reduce(
    (sum, text) => sum + estimateDuration(text),
    0,
  )

  const target =
    typeof totalDuration === 'number' && totalDuration > 0
      ? totalDuration
      : estimatedTotal

  let assigned = 0

  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return Math.max(1, Number((target - assigned).toFixed(2)))
    }

    const duration = Number(((target * weight) / totalWeight).toFixed(2))

    assigned += duration
    return Math.max(1, duration)
  })
}

function createDraft(
  narration: string,
  template: SceneTemplate,
  index: number,
  betweenLines: boolean,
): SceneDraft {
  const socialVisual = betweenLines ? getBetweenLinesStyle(narration) : null

  const visualDirection = socialVisual
    ? socialVisual.object
    : template.visualDirection

  const characterAction = socialVisual ? socialVisual.action : template.action

  const mood = socialVisual ? socialVisual.mood : template.mood

  const visualPrompt = betweenLines
    ? [
        '2D minimalist animation.',
        'Dark navy or nearly black background.',
        'Simple white stick figure characters.',
        'Clean white outlines and expressive minimal faces.',
        'Warm golden yellow accents for important symbols.',
        `Scene subject: ${visualDirection}.`,
        `Character action: ${characterAction}.`,
        'Consistent character design across all scenes.',
        'No 3D rendering, no photorealism, no unnecessary details.',
      ].join(' ')
    : [
        'Create a clear visual scene suitable for video production.',
        `Subject: ${visualDirection}.`,
        `Action: ${characterAction}.`,
        `Mood: ${mood}.`,
        'Keep the scene visually readable and consistent.',
      ].join(' ')

  return {
    title: template.title,
    description:
      `هدف المشهد: ${template.purpose}\n` +
      `التصور البصري: ${visualDirection}\n` +
      `حركة العناصر: ${characterAction}\n` +
      `حالة المشهد: ${mood}`,
    narration,
    duration: 5,
    visualPrompt,
    cameraDirection: template.camera,
    characterAction,
    visualStyle: betweenLines
      ? 'Minimalist 2D Stick Figure Animation'
      : 'Category-based visual style',
    background: betweenLines ? '#080D18' : 'حسب طبيعة المحتوى',
    transition: index === 0 ? 'fade-in' : 'smooth-cut',
    mood,
  }
}

export function planScenes(input: ScenePlanningInput): SceneDraft[] {
  const idea = input.idea?.trim() ?? ''
  const script = input.script?.trim() ?? ''
  const category = input.category ?? 'auto'

  if (!idea && !script) return []

  const maxScenes = Math.min(12, Math.max(1, input.maxScenes ?? 8))

  const templates = getTemplates(category)
  const betweenLines = isBetweenLines(`${idea} ${script}`, category)

  const sentences = script ? splitScript(script) : []

  let groups: string[]

  if (sentences.length > 0) {
    groups = groupSentences(sentences, maxScenes)
  } else {
    groups = templates.map((_template, index) => (index === 0 ? idea : ''))
  }

  const drafts = groups.map((narration, index) => {
    const template = templates[index % templates.length]
    return createDraft(narration, template, index, betweenLines)
  })

  const durations = distributeDurations(
    drafts.map((draft) => draft.narration || draft.description),
    input.totalDuration,
  )

  return drafts.map((draft, index) => ({
    ...draft,
    duration: durations[index],
  }))
}

export function buildSceneObjects(drafts: SceneDraft[]): Scene[] {
  let currentTime = 0

  return drafts.map((draft, index) => {
    const duration = Math.max(1, Number(draft.duration.toFixed(2)))

    const visualProperties: Record<string, unknown> = {
      visualPrompt: draft.visualPrompt ?? '',
      cameraDirection: draft.cameraDirection ?? '',
      characterAction: draft.characterAction ?? '',
      mood: draft.mood ?? '',
      background: draft.background ?? '',
    }

    const visualLayer: SceneLayer = {
      id: `visual-${Date.now()}-${index}`,
      type: 'animation',
      name: 'Visual Scene Direction',
      content: draft.visualPrompt ?? draft.description,
      startTime: 0,
      duration,
      properties: visualProperties,
      visible: true,
      locked: false,
    }

    const textLayer: SceneLayer = {
      id: `narration-${Date.now()}-${index}`,
      type: 'text',
      name: 'Narration',
      content: draft.narration,
      startTime: 0,
      duration,
      properties: {
        alignment: 'center',
        direction: 'rtl',
        language: 'ar',
      },
      visible: true,
      locked: false,
    }

    const sceneAssets: ProjectAsset[] = []

    const scene: Scene = {
      id: `scene-${Date.now()}-${index}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      order: index + 1,
      title: draft.title,
      description: draft.description,
      narration: draft.narration,
      duration,
      startTime: Number(currentTime.toFixed(2)),
      endTime: Number((currentTime + duration).toFixed(2)),
      visualStyle: draft.visualStyle,
      background: draft.background,
      transition: draft.transition,
      assets: sceneAssets,
      layers: [visualLayer, textLayer],
      notes: [
        `اتجاه الكاميرا: ${draft.cameraDirection ?? 'غير محدد'}`,
        `حركة الشخصية: ${draft.characterAction ?? 'غير محددة'}`,
        `الحالة الشعورية: ${draft.mood ?? 'غير محددة'}`,
      ].join('\n'),
    }

    currentTime += duration
    return scene
  })
}
