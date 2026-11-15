/** The instruction sent to Gemini so that it answers with a scene list the engine can play. */
export function buildScenePrompt(args: { script: string; voiceSeconds: number | null; imageNames: string[]; format: string; styleNote?: string; allowExcel: boolean; allowDraw?: boolean }) {
  const { script, voiceSeconds, imageNames, format, styleNote, allowExcel, allowDraw } = args
  const style = styleNote ? `\n\nتعليمات إلزامية من صاحب الصفحة (أهم من أي شيء تحت): ${styleNote}` : ''
  const length = voiceSeconds
    ? `طول الصوت ${voiceSeconds.toFixed(1)} ثانية. اجعل مجموع duration لكل المشاهد قبل مشهد اللوجو الأخير قريب من ${Math.max(1, voiceSeconds - 0).toFixed(0)} ثانية.`
    : 'لا يوجد صوت بعد: قدّر المدة من طول السكريبت (حوالي 2.5 كلمة في الثانية).'
  return `حوّل السكريبت التالي إلى قائمة مشاهد لريل ${format === 'vertical' ? 'طولي 9:16' : format === 'horizontal' ? 'عرضي 16:9' : 'مربع'}، وأجب بـ JSON فقط بدون أي شرح وبدون \`\`\`.${style}

الشكل المطلوب:
{"scenes":[ ... ]}

أنواع المشاهد (كل مشهد له duration بالثواني، واختياري caption: نص قصير أو قائمة {text,from,to} بثواني نسبية لبداية المشهد):
- {"type":"text","duration":3,"title":"...","subtitle":"...","highlight":"كلمة من العنوان تتلوّن"}  (لا تكتب theme: الألوان من القالب)
${allowExcel ? `- {"type":"excel","duration":9,"columns":[70,260,250,170],"rows":[["م","الاسم","القسم","الراتب"],["1","أحمد","المبيعات","8,500"]],"steps":[ ... ]}
   الصف الأول (rows[0]) هو العنوان، وأعمدة الجدول تبدأ من A. أضف صفوفاً فاضية لو هتكتب فيها.
   الخطوات (at بالثواني من بداية المشهد):
   - {"at":1,"do":"select","range":"D2:D6","over":1}  تحديد خلية أو نطاق
   - {"at":3,"do":"keys","keys":["Ctrl","A"],"hold":2.4}  إظهار مفاتيح الكيبورد
   - {"at":5,"do":"type","cell":"D7","text":"=SUM(D2:D6)","result":"39,500","over":1.5}  كتابة (والنتيجة تظهر في الخلية)
   - {"at":7,"do":"format","range":"C7:D7","fill":"#fff4c2","bold":true}  تلوين أو Bold
` : ''}
${allowDraw ? `- {"type":"draw","duration":4,"title":"الجملة كاملة","highlight":"أهم كلمة فيها","items":[ ... ]}  مشهد رسم بشخصيات عود. هو الاختيار الأول لكل جملة تقريباً.
   مكان كل عنصر x من 0 (يسار) إلى 100 (يمين)، و at اختياري = ثانية ظهوره داخل المشهد. العناصر المتاحة فقط:
   {"kind":"person","x":50,"mood":"neutral|sad|happy","pose":"stand|wave","hair":false,"size":1}  شخصية (hair:true لشخصية بنت، size:0.6 لشخص صغير في زحمة)
   {"kind":"spotlight","x":50}  بقعة ضوء (لشخص وحيد أو مميز)
   {"kind":"wave","from":30,"to":70,"color":"#4f8cff"}  موجة صوت/كلام بين شخصين
   {"kind":"bubble","x":75,"text":"كلمتين"}  فقاعة كلام بنص قصير
   {"kind":"dots","x":50}  فقاعة تفكير بنقط
   {"kind":"cloud","x":50,"y":-28,"text":"كلمة","color":"#4f8cff"}  سحابة مشاعر أو فكرة بكلمة
   {"kind":"moon","x":88}  ليل (قمر ونجوم)
   {"kind":"house","x":70}  بيت
   {"kind":"clock","x":60}  ساعة
   {"kind":"phone","x":60,"text":"كلمة"}  موبايل
   {"kind":"magnifier","x":50}  عدسة (ملاحظة/بحث)
   {"kind":"heart","x":50}  قلب
   لا تستخدم أي kind غير دول. من 2 إلى 6 عناصر في المشهد، وبلا تداخل (شخصان على الأقل بينهم 30 وحدة).
` : ''}- {"type":"image","duration":5,"src":"اسم ملف الصورة","motion":"zoom-in|zoom-out|pan-left|pan-right","title":"اختياري"}
   استخدم فقط أسماء الصور المتاحة${imageNames.length ? ': ' + imageNames.join(', ') : ' (لا توجد صور مرفوعة، فلا تستخدم هذا النوع)'}.
- {"type":"logo","duration":3}  آخر مشهد دائماً. لا تكتب فيه اسم صفحة ولا handle ولا لوجو: يتضاف تلقائياً.

قواعد:
- لا تختصر ولا تحذف أي جملة من السكريبت: كل جملة تظهر في مشهد (title أو subtitle أو caption) بنفس معناها وبكلام المستخدم. عدد المشاهد النصية يساوي تقريباً عدد الجمل.
- العنوان (title) قصير (حتى 6 كلمات) وهو أهم كلمات الجملة، وفي highlight أهم كلمة منه. الجملة الكاملة تروح في subtitle.
- لا تكتب أسماء صفحات أو حسابات لم تُذكر في السكريبت.
- ابدأ بمشهد text يجذب الانتباه، وانهِ بمشهد logo.
- كل caption جملة قصيرة بالمصري (3 إلى 7 كلمات)، وتتزامن مع الكلام.
${allowExcel ? '- مشاهد Excel تعرض الشرح خطوة بخطوة بنفس ترتيب كلام السكريبت. بيانات الجدول واقعية (أسماء موظفين، أقسام، مبالغ).' : '- ممنوع تماماً استخدام مشاهد جداول أو Excel. استخدم المشاهد المذكورة أعلاه فقط.'}
${allowDraw ? '- كل جملة من السكريبت = مشهد draw واحد: الجملة في title وأهم كلمة في highlight، والعناصر ترسم معناها.\n' : ''}- لو مفيش مشهد يناسب الجملة، استخدم مشهد text. لا تخترع أنواع مشاهد جديدة.
- ${length}

السكريبت:
${script.trim()}`
}

/** Pulls the first JSON object out of a reply that may include code fences or extra words. */
export function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply)
  const body = fenced ? fenced[1] : reply
  const start = body.indexOf('{')
  if (start < 0) throw new Error('الرد مفيهوش JSON.')
  let depth = 0
  let inString = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return JSON.parse(body.slice(start, i + 1))
  }
  throw new Error('الـ JSON مش مكتمل.')
}
