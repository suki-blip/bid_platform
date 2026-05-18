"use client";

// HelpIndex — מדריך שימוש בעברית.
//
// אינדקס מקוטלג של כל פעולה במערכת עם הוראות מפורטות בעברית. מוטמע בדף ההגדרות כ-Section
// נפרד. כל קטגוריה היא accordion שניתן לפתוח ולסגור; חיפוש חופשי מסנן את הפריטים בכל
// הקטגוריות. הטקסט כולו RTL ובפונט עברי קריא.
//
// כשמוסיפים פיצ'ר חדש לפלטפורמה, יש להוסיף כאן ערך — זה המרכז היחיד לתיעוד משתמש.

import { useMemo, useState } from "react";

interface HelpItem {
  /** ID לקישור מתוך הניווט / שיתוף. */
  id: string;
  /** כותרת הפעולה — "איך מוסיפים תורם". */
  title: string;
  /** שורת תיאור קצרה — מה ולמה. */
  blurb?: string;
  /** רשימת שלבים בסדר ביצוע. */
  steps: string[];
  /** מסלול ניווט (לדוגמה: Donors → New donor). */
  path?: string;
  /** טיפים נוספים אחרי השלבים. */
  tips?: string[];
}

interface HelpCategory {
  id: string;
  /** כותרת הקטגוריה (תורמים / קמפיינים / וכו'). */
  title: string;
  /** תיאור קצר של הקטגוריה. */
  blurb?: string;
  items: HelpItem[];
}

// === התוכן: כל פעולה במערכת ===
//
// סדר הקטגוריות הוא לפי תדירות שימוש (התחלה למתחילים → פיצ'רים מתקדמים).
const CATEGORIES: HelpCategory[] = [
  {
    id: "donors",
    title: "תורמים ולידים",
    blurb: "ניהול אנשי הקשר במערכת — תורמים פעילים ולידים שעדיין לא תרמו.",
    items: [
      {
        id: "add-donor",
        title: "הוספת תורם / ליד חדש",
        path: "תפריט עליון → Donors (או Leads) → New donor",
        steps: [
          "לחץ על Donors בסרגל העליון (לליד — Leads).",
          "לחץ על הכפתור הכהה 'New donor' / 'New lead' בפינה הימנית-עליונה.",
          "מלא את השדות: First name (חובה), Last name, Hebrew name, אימייל, טלפון, כתובת.",
          "ניתן למלא 'שם עברי' מלא, או לחילופין שם פרטי + שם משפחה בעברית בנפרד.",
          "בחר Source (מקור הקשר) אם רוצים לעקוב מאיפה הגיע התורם.",
          "סמן Do not contact אם התורם ביקש לא לקבל פניות.",
          "לחץ Save — תועבר לפרופיל התורם.",
        ],
        tips: [
          "לידים נשמרים בלי לחץ הוספת פלאג. אחרי שהליד תורם בפעם הראשונה, סטטוסו עובר אוטומטית ל-'donor'.",
        ],
      },
      {
        id: "search-filter-donors",
        title: "חיפוש וסינון תורמים",
        path: "Donors",
        steps: [
          "השתמש בתיבת החיפוש למעלה — חיפוש לפי שם פרטי, שם משפחה, שם עברי, אימייל, או ארגון.",
          "סנן לפי Source (מקור) דרך הסלקטור.",
          "סמן את ה-chip 'Lapsed (12m+)' כדי לראות רק תורמים שלא תרמו ב-12 החודשים האחרונים.",
          "סמן 'Has open pledges' כדי לראות תורמים עם פלאג פתוח לא מסולק.",
          "לחץ על כותרת עמודה (Name / Paid / Pledged / וכו') כדי למיין. לחיצה שנייה הופכת את הכיוון, שלישית מבטלת.",
        ],
        tips: [
          "המיון נשמר עד שסוגרים את הטאב. סוגר את חלון הדפדפן? המיון יתאפס.",
          "אחרי סינון, ניתן לבחור תורמים מרובים ולבצע פעולות גורפות (מחיקה, תיוג, הקצאה).",
        ],
      },
      {
        id: "edit-donor",
        title: "עריכת פרטי תורם",
        path: "Donors → לחץ על שורת תורם → פאנל צד → 'Edit details'",
        steps: [
          "לחץ פעם אחת על שורת התורם — נפתח פאנל צד עם פרטים.",
          "לחץ על שם התורם כדי להיכנס לפרופיל המלא.",
          "לחץ על Edit details / Edit profile כדי לערוך.",
          "אפשר לערוך שמות, אימייל, ארגון, תאריכים (יום הולדת, יארצייט, יום נישואין), הערות.",
          "Esc סוגר את החלון בלי שמירה.",
        ],
      },
      {
        id: "delete-donor",
        title: "מחיקת תורם",
        path: "Donors → בחר תורם(ים) → Delete",
        steps: [
          "סמן את התורם(ים) שרוצים למחוק (תיבת checkbox בצד שמאל).",
          "לחץ על כפתור 'Delete X' הכתום.",
          "אשר במודאל האישור.",
          "התורם עובר לסל המחזור (Recycle Bin) — אפשר לשחזר תוך 30 יום.",
        ],
        tips: [
          "מחיקת תורם מוחקת גם את הפלאגים והתשלומים שלו (בקסקיד), אבל הכל ניתן לשחזור מסל המחזור.",
        ],
      },
      {
        id: "bulk-actions",
        title: "פעולות גורפות (תיוג / הקצאה / מחיקה)",
        path: "Donors → סמן מספר תורמים → סרגל פעולות נפתח",
        steps: [
          "סמן 2 או יותר תורמים באמצעות תיבות הסימון.",
          "סרגל כחול נפתח בראש הטבלה: '{N} selected'.",
          "🏷 Tag — מוסיף תג לכל הנבחרים (לדוגמה 'Annual Dinner Invite').",
          "👤 Assign — פותח dropdown לבחירת fundraiser ומעביר את כל הנבחרים אליו.",
          "Delete — מוחק את כל הנבחרים (לסל המחזור).",
        ],
      },
      {
        id: "export-donors",
        title: "ייצוא רשימת תורמים ל-CSV",
        path: "Donors → ⬇ Export CSV",
        steps: [
          "סנן את הרשימה לפי מה שצריך (search / Lapsed / Source וכו').",
          "מיין לפי עמודה רצויה.",
          "לחץ על '⬇ Export CSV' בפינה הימנית-עליונה ליד 'New donor'.",
          "קובץ ה-CSV יורד עם השם donors-YYYY-MM-DD.csv.",
        ],
        tips: ["ה-CSV כולל BOM של UTF-8 כדי שאקסל יציג עברית נכון."],
      },
    ],
  },

  {
    id: "calls-notes",
    title: "שיחות, הערות, ומעקב",
    blurb: "תיעוד אינטראקציות עם תורם.",
    items: [
      {
        id: "log-call",
        title: "תיעוד שיחה",
        path: "פרופיל תורם → Calls → + Log call",
        steps: [
          "פתח את פרופיל התורם.",
          "לשונית 'Calls' — לחץ '+ Log call'.",
          "בחר תאריך, שעה, כיוון (נכנסת/יוצאת), ערוץ (טלפון/וואטסאפ/מייל).",
          "כתוב סיכום קצר ו-outcome (תגובה / השאיר הודעה / אישר תרומה וכו').",
          "אופציונלי: תמלול מפורט בשדה Transcript.",
          "Save.",
        ],
      },
      {
        id: "add-note",
        title: "הוספת הערה לתורם",
        path: "פרופיל תורם → Notes",
        steps: [
          "פתח פרופיל תורם → לשונית 'Notes'.",
          "כתוב את ההערה בתיבת הטקסט.",
          "Save.",
          "אפשר לסמן הערה כ-'Pinned' שתופיע בראש.",
        ],
      },
      {
        id: "schedule-followup",
        title: "תזמון מעקב (Follow-up)",
        path: "פרופיל תורם → Schedule → + Schedule follow-up",
        steps: [
          "פרופיל תורם → לשונית 'Schedule'.",
          "+ Schedule follow-up.",
          "כותרת, תאריך + שעה, סוג (call / email / meeting / task), עדיפות.",
          "אופציונלי: תזכורת X דקות לפני.",
          "Save — יופיע בלוח השנה ובדף Today שלך ביום הרלוונטי.",
        ],
      },
    ],
  },

  {
    id: "pledges",
    title: "פלאגים (הבטחות תרומה)",
    blurb: "פלאג = התחייבות לתרום סכום מסוים בעתיד. שונה מתשלום (כסף שכבר נכנס).",
    items: [
      {
        id: "add-pledge",
        title: "הוספת פלאג (הבטחה)",
        path: "פרופיל תורם → + Add pledge",
        steps: [
          "פתח פרופיל תורם.",
          "לחץ '+ Add pledge'.",
          "סכום פלאג, תאריך, קמפיין (אופציונלי), הערות.",
          "תוכנית תשלום: lump_sum (חד-פעמי) / monthly / weekly / quarterly / annual.",
          "Installments total: לכמה תשלומים לחלק.",
          "Save — המערכת יוצרת אוטומטית שורת תשלום לכל installment.",
        ],
        tips: [
          "אם תורם משלם תרומה בלי פלאג מקדים, המערכת יוצרת פלאג סינתטי (is_standalone=1) באופן אוטומטי כדי שהתשלום יוכל לשבת על משהו.",
        ],
      },
      {
        id: "edit-pledge",
        title: "עריכת פלאג",
        path: "פרופיל תורם או דף תשלומים → לחץ 'Pledge'",
        steps: [
          "מהפרופיל: לשונית Giving → לחץ על שורת הפלאג.",
          "מדף Payments: לחץ על 'Pledge' בעמודת הפעולות של שורה כלשהי.",
          "ניתן לערוך: סכום, פרויקט, סטטוס (open/cancelled), הערות, תאריך.",
          "לכפתור 'View payments' תוכל לראות את כל התשלומים של הפלאג הזה.",
        ],
      },
      {
        id: "delete-pledge",
        title: "מחיקת פלאג",
        path: "מודאל עריכת פלאג → Delete pledge",
        steps: [
          "פתח מודאל עריכת פלאג.",
          "לחץ 'Delete pledge' (כפתור כתום בפינה השמאלית).",
          "אם הפלאג עוד לא קיבל תשלום — מחיקה ישירה.",
          "אם יש כבר תשלומים: בחר מה לעשות איתם:",
          "  • Delete all (מחיקה גם של התשלומים)",
          "  • Move to another pledge (העברה לפלאג אחר)",
          "  • Convert to standalone donations (להפוך לתרומות חד-פעמיות)",
          "הפלאג ילך לסל המחזור (אפשר לשחזר 30 יום).",
        ],
      },
      {
        id: "audit-pledges",
        title: "ביקורת פלאגים — מציאת פלאג חריג",
        path: "דף ראשי → 'See the 20 largest open pledges'",
        steps: [
          "אם הסכום ב-'Open pledges' בדף הראשי נראה לא הגיוני.",
          "לחץ על הקישור הכחול מתחת לקופסאות הסטטיסטיקה.",
          "תיפתח רשימה של 20 הפלאגים הפתוחים הגדולים ביותר לפי outstanding.",
          "פלאגים שתורם שלהם נמחק (יתומים) יופיעו עם רקע כתום ותג 'Orphan'.",
          "לחץ Delete לכל פלאג חריג כדי לשלוח לסל המחזור.",
        ],
      },
    ],
  },

  {
    id: "payments",
    title: "תשלומים וחיובים",
    blurb: "רישום של כסף שנכנס בפועל — אשראי, צ'ק, מזומן, העברה.",
    items: [
      {
        id: "make-payment",
        title: "ביצוע תשלום חדש",
        path: "תפריט עליון → New payment",
        steps: [
          "לחץ 'New payment' בסרגל העליון.",
          "Step 1: חפש ובחר תורם (או הזן ?donor=ID בכתובת לדילוג ישיר).",
          "Step 2: בחר מצב — 'Pay against existing pledge' / 'New donation' / 'Split'.",
          "Step 3: סכום, שיטת תשלום (כרטיס אשראי / צ'ק / מזומן / העברה / אחר), פרויקט.",
          "אם בחרת Credit card: יופיעו שדות אשראי מאובטחים (iframes של Sola/Cardknox).",
          "סמן '💾 Save card for future charges' אם רוצים לשמור לחיובים עתידיים.",
          "סמן '📅 Charge monthly automatically' לתשלומים חוזרים אוטומטיים.",
          "סמן 'Don't send receipt email' אם לא רוצים שיישלח אימייל.",
          "לחץ 'Charge' — התשלום יתבצע מיד.",
        ],
      },
      {
        id: "schedule-payment",
        title: "תשלום מתוזמן (לתאריך עתידי)",
        path: "New payment → Charge mode = 'Schedule for date'",
        steps: [
          "בדף New payment, בחר Charge mode: 'Schedule for date'.",
          "בחר את התאריך הרצוי.",
          "הזן פרטי כרטיס + סמן 'Save card'.",
          "Submit — תיווצר שורה ב-Collections עם הסטטוס 'scheduled'.",
          "ב-09:00 UTC ביום הרצוי, הקרון האוטומטי יחייב את הכרטיס.",
        ],
      },
      {
        id: "recurring-charge",
        title: "תשלום חודשי אוטומטי",
        path: "New payment → Charge mode = 'Recurring monthly'",
        steps: [
          "בדף New payment, בחר Charge mode: 'Recurring monthly'.",
          "מספר חיובים (לדוגמה 12 לתשלום שנה).",
          "תאריך בחודש לחיוב.",
          "אופציה: 'Charge first installment now' לחיוב מיידי.",
          "הזן פרטי כרטיס. הוא יישמר אוטומטית.",
          "ב-09:00 UTC בכל ה-{day} בחודש, הקרון יחייב את הכרטיס.",
        ],
        tips: [
          "כל שורה ב-Collections יופיע 'auto-charge' כאשר המנגנון פעיל. ניתן להפסיק זאת על-ידי מחיקת השורה מ-Collections.",
        ],
      },
      {
        id: "manual-charge-saved-card",
        title: "חיוב מיידי עם כרטיס שמור",
        path: "פרופיל תורם → Saved cards → 💳 Charge",
        steps: [
          "פתח פרופיל תורם → מצא את הפאנל 'Saved cards'.",
          "לחץ על 💳 Charge ליד הכרטיס.",
          "הזן סכום + פרויקט + שיטה.",
          "אישור → החיוב מתבצע מיד דרך הכרטיס השמור.",
        ],
      },
      {
        id: "retry-failed",
        title: "ניסיון חיוב מחדש לתשלום שנכשל",
        path: "Collections → ↻ Retry",
        steps: [
          "פתח את דף Collections.",
          "סנן ל-'Bounced / Failed'.",
          "לחץ על הכפתור הכתום '↻ Retry' בשורה הרלוונטית.",
          "המודאל נפתח עם בחירת כרטיס שמור (אם יש).",
          "Confirm → ניסיון חיוב מחדש.",
        ],
      },
      {
        id: "send-receipt",
        title: "שליחת קבלה ידנית",
        path: "Payments → 📧 Receipt",
        steps: [
          "דף Payments → מצא את שורת התשלום (status = paid).",
          "לחץ '📧 Receipt' בעמודת הפעולות.",
          "המייל נשלח לכתובת התורם — תקבל אישור כ-toast למטה.",
        ],
      },
      {
        id: "filter-payments",
        title: "סינון תשלומים לפי שיטה / פלאג / סוג",
        path: "Payments",
        steps: [
          "סרגל chips למעלה: Status, Method, Type.",
          "Status: All / Paid / Scheduled / Bounced / Cancelled / Pending.",
          "Method: לחיצה מסמנת — בחירה מרובה.",
          "Type: All / From a pledge / Standalone donations.",
          "?pledge_id=X בכתובת = רק תשלומים של פלאג מסוים (באנר כחול עם 'Clear' יופיע).",
          "מהמודאל של עריכת פלאג, כפתור 'View payments' מנתב לכתובת זו.",
        ],
      },
      {
        id: "audit-payments",
        title: "ביקורת תשלומים — מציאת תשלום חריג",
        path: "Payments → 'See the 20 largest paid payments'",
        steps: [
          "דף Payments → קישור מתחת לכרטיסיות הסיכום.",
          "תיפתח רשימה של 20 התשלומים הגדולים ביותר ב-status='paid'.",
          "ניתן ללחוץ Edit כדי לפתוח את עורך התשלום ולמחוק רשומה חריגה.",
        ],
      },
    ],
  },

  {
    id: "cards",
    title: "כרטיסי אשראי שמורים",
    blurb: "ניהול כרטיסים שתורמים שמרו במערכת לחיוב חוזר.",
    items: [
      {
        id: "save-card",
        title: "שמירת כרטיס אשראי",
        path: "New payment → סמן '💾 Save card for future charges'",
        steps: [
          "בעת ביצוע תשלום באשראי, סמן את התיבה '💾 Save card'.",
          "אחרי שהחיוב מצליח, הכרטיס נשמר בכספת של Sola/Cardknox.",
          "המערכת לא רואה את מספר הכרטיס המלא — רק 4 ספרות אחרונות.",
          "הכרטיס יופיע בפרופיל התורם תחת 'Saved cards'.",
        ],
      },
      {
        id: "manage-cards",
        title: "ניהול כרטיסים שמורים",
        path: "פרופיל תורם → פאנל 'Saved cards'",
        steps: [
          "לראות את כל הכרטיסים השמורים של התורם.",
          "Set as default — לקבוע איזה ייחשב הברירת מחדל.",
          "Remove — מסיר את הכרטיס (לא ניתן לשחזור).",
          "Charge — לבצע חיוב מיידי עם כרטיס זה.",
          "כרטיסים שפג תוקפם מסומנים אדום.",
        ],
      },
    ],
  },

  {
    id: "campaigns",
    title: "קמפיינים",
    blurb: "מיזמי גיוס — Annual Drive, Building Fund, וכדומה.",
    items: [
      {
        id: "create-campaign",
        title: "יצירת קמפיין חדש",
        path: "Campaigns → + New campaign",
        steps: [
          "סרגל עליון → Campaigns → + New campaign.",
          "Name (חובה), Description, Goal amount (יעד), תאריכי התחלה וסיום.",
          "אופציונלי: Parent campaign (תת-קמפיין מתחת לאחר).",
          "Save — הקמפיין מופיע ברשימת ה-Active campaigns.",
        ],
        tips: ["קמפיין יכול להיות תת-קמפיין של אחר (לדוגמה: Annual Dinner 2026 כתת-קמפיין של Annual Drive)."],
      },
      {
        id: "campaign-progress",
        title: "מעקב התקדמות קמפיין",
        path: "Campaigns → לחץ על קמפיין",
        steps: [
          "כל כרטיס קמפיין מציג: Raised, Goal, Progress bar, מספר תורמים, סכום פלאג.",
          "פס ההתקדמות מציג אחוז. כשמגיעים ל-100%+, הפס מתחלף לזהב והכותרת ל-'🎯 Goal achieved'.",
          "לחץ על קמפיין כדי לראות פרטים מלאים, פלאגים, תשלומים, ומועמדים.",
        ],
      },
      {
        id: "campaign-prospects",
        title: "ניהול מועמדים (Prospects) לקמפיין",
        path: "פרופיל קמפיין → Prospects",
        steps: [
          "פתח פרופיל קמפיין.",
          "בפאנל 'Campaign prospects', לחץ + Add prospect.",
          "בחר תורם + סכום משוער + סטטוס (pending / called / confirmed / declined).",
          "זה יוצר רשימת call-list פרטית — לא נכלל בסכום הפלאגים הרשמי של הקמפיין.",
          "אחרי שמועמד אכן תרם, מחקו את המועמד או סמנו כ-'confirmed'.",
        ],
      },
      {
        id: "campaign-email-blast",
        title: "שליחת דיוור לקמפיין",
        path: "פרופיל קמפיין → 📧 Email campaign donors",
        steps: [
          "פרופיל קמפיין → לחץ '📧 Email campaign donors'.",
          "בחר Recipients: Campaign donors / Prospect list / Open pledgers / All donors.",
          "אופציונלי: 'Start from a saved template' — טוען subject + body מתבנית שמורה.",
          "כתוב Subject + Body (HTML מותר). השתמש ב-{{first_name}}, {{hebrew_name}}, וכו'.",
          "**חשוב**: לפני שליחה — Test send לכתובת שלך, ראה איך נראה.",
          "אחרי שאתה מרוצה — לחץ 'Send blast'.",
          "המערכת שולחת בסידרה ~10 לשנייה. תקבל סיכום: X sent, Y failed.",
        ],
        tips: [
          "תורמים עם email_opt_in='none' או do_not_contact=1 לא יקבלו דיוורים — המערכת מסננת אותם אוטומטית.",
        ],
      },
    ],
  },

  {
    id: "email-templates",
    title: "תבניות אימייל",
    blurb: "עריכת התוכן של אימיילים אוטומטיים (קבלות) ואימיילי דיוור.",
    items: [
      {
        id: "create-template",
        title: "יצירת תבנית אימייל חדשה",
        path: "תפריט משתמש → Emails → + (ליד הקטגוריה)",
        steps: [
          "לחץ על שם המשתמש בפינה הימנית → Emails.",
          "מצא את הקטגוריה: Receipt / Campaign blast / Thank you / Custom.",
          "לחץ על ה-'+' ליד הקטגוריה.",
          "מלא: Name (פנימי), Subject, Body HTML.",
          "השתמש בכפתורי המשתנים מתחת לתיבת ה-Body כדי להכניס {{first_name}}, {{amount}}, וכו'.",
          "לחץ 'Preview' כדי לראות איך זה ייראה עם נתוני דוגמה.",
          "Save / Create.",
        ],
      },
      {
        id: "set-default-receipt",
        title: "הגדרת תבנית קבלה כברירת מחדל",
        path: "Emails → תבנית מסוג Receipt",
        steps: [
          "פתח תבנית מסוג Receipt.",
          "סמן 'Set as default receipt' (קופסה ירוקה).",
          "Save.",
          "מעכשיו, כל קבלה שתישלח אוטומטית אחרי חיוב — תשתמש בתבנית הזו.",
          "אם אין תבנית default — נשתמש ב-HTML המוטמע הברירת מחדל.",
        ],
      },
      {
        id: "edit-template",
        title: "עריכת תבנית קיימת",
        path: "Emails → לחץ על שם תבנית",
        steps: [
          "לחץ על שם התבנית בעמודה השמאלית.",
          "ערוך Name, Subject, Body.",
          "Save (הכפתור הימני).",
          "Preview כדי לוודא לפני שמירה.",
        ],
      },
    ],
  },

  {
    id: "collections-reports",
    title: "גבייה ודוחות",
    blurb: "מעקב אחרי חיובים שעברו תאריך + סטטיסטיקות גיוס.",
    items: [
      {
        id: "collections-views",
        title: "צפייה בחיובים פתוחים",
        path: "Collections",
        steps: [
          "סרגל עליון → Collections.",
          "ברירת מחדל: 'Overdue' — חיובים שעברו תאריך.",
          "Tabs: All / Overdue / Upcoming (7 ימים) / Bounced.",
          "סינון לפי תורם, פרויקט, שיטה, טווח סכום.",
          "כל שורה מציגה את הסכום, תורם, פרויקט, מספר ימי איחור, וטלפון.",
        ],
      },
      {
        id: "reports-overview",
        title: "צפייה בדוחות",
        path: "Reports",
        steps: [
          "סרגל עליון → Reports.",
          "סנן לפי תאריכים, פרויקטים, מקורות, תורמים, fundraisers (מנהל בלבד).",
          "Quick presets: Last 30 days / 90 days / YTD / All time.",
          "תראה: סכום כולל שגויס, מספר תורמים ייחודיים, ממוצע לתרומה, סכום פלאג פתוח.",
          "Charts: by month, by project, by source, by method.",
          "Top donors (12 הראשונים לפי סכום בתקופה).",
          "Lapsed donors (תורמים שלא נתנו 12 חודש).",
        ],
      },
      {
        id: "export-reports",
        title: "ייצוא דוח",
        path: "Reports → Export",
        steps: [
          "בדף Reports, סנן לפי הצורך.",
          "לחץ על Export (זמין בכל פאנל פירוט).",
          "קובץ CSV יורד עם הפרטים המוצגים.",
        ],
      },
    ],
  },

  {
    id: "recycle-bin",
    title: "סל מחזור (Recycle Bin)",
    blurb: "שחזור מחיקות עד 30 יום אחורה.",
    items: [
      {
        id: "view-trash",
        title: "צפייה בסל המחזור",
        path: "תפריט משתמש → Recycle Bin",
        steps: [
          "לחץ על שם המשתמש בפינה הימנית → Recycle Bin.",
          "תראה את כל מה שנמחק ב-30 הימים האחרונים: תורמים, פלאגים, תשלומים.",
          "ימי מתבטא 'Auto-purge in X days' — אחרי 30 יום הקרון מנקה.",
          "סנן לפי סוג (All / Donors / Pledges / Payments).",
        ],
      },
      {
        id: "restore-item",
        title: "שחזור פריט שנמחק",
        path: "Recycle Bin → ↺ Restore",
        steps: [
          "מצא את הפריט ברשימה.",
          "לחץ על '↺ Restore' (כפתור כהה).",
          "הפריט חוזר למצב המקורי לפני המחיקה.",
          "אם זה תורם — כל הפלאגים, התשלומים, השיחות, וההערות שלו חוזרים גם.",
        ],
      },
      {
        id: "permanent-delete",
        title: "מחיקה לצמיתות",
        path: "Recycle Bin → Delete forever",
        steps: [
          "במידה ורוצים למחוק מיד (לא לחכות 30 יום).",
          "לחץ 'Delete forever' (כפתור כתום).",
          "אישור — הפריט נמחק מהמערכת לחלוטין.",
          "אין שחזור אחרי זה.",
        ],
      },
    ],
  },

  {
    id: "team",
    title: "צוות ו-Fundraisers",
    blurb: "ניהול חברי צוות והקצאת תורמים.",
    items: [
      {
        id: "add-fundraiser",
        title: "הוספת fundraiser",
        path: "Team → + New fundraiser",
        steps: [
          "מנהל בלבד.",
          "Team → + New fundraiser.",
          "Name, Email — תיווצר סיסמה זמנית.",
          "ה-fundraiser יוכל להיכנס לחשבון עם הסיסמה ולשנותה.",
        ],
      },
      {
        id: "assign-donors",
        title: "הקצאת תורמים ל-fundraiser",
        path: "Donors → בחר תורמים → 👤 Assign",
        steps: [
          "ב-Donors, סמן את התורמים.",
          "לחץ '👤 Assign ▾'.",
          "בחר את ה-fundraiser מהתפריט.",
          "ה-fundraiser יראה רק את התורמים שהוקצו לו (סקופ אוטומטי).",
        ],
      },
      {
        id: "reassign-bulk",
        title: "העברת תורמים מ-fundraiser אחד לאחר",
        path: "Team → Reassign mode",
        steps: [
          "פתח דף Team.",
          "לחץ על 'Reassign mode'.",
          "סמן את התורמים להעביר.",
          "בחר את ה-fundraiser החדש.",
          "Commit reassign.",
        ],
      },
    ],
  },

  {
    id: "audit-log",
    title: "יומן ביקורת (Audit Log)",
    blurb: "מעקב אחרי כל שינוי במערכת — מי עשה מה ומתי.",
    items: [
      {
        id: "view-audit",
        title: "צפייה ביומן הביקורת",
        path: "תפריט משתמש → Audit Log",
        steps: [
          "מנהל בלבד.",
          "תפריט משתמש → Audit Log.",
          "תראה רשימה מסודרת לפי זמן: מי, מה (entity), פעולה (create/update/delete), סיכום.",
          "סנן לפי סוג entity (Donor / Pledge / Payment / Blast / Template).",
          "תיבת חיפוש מסננת לפי טקסט בסיכום / מבצע פעולה / שם פעולה.",
        ],
      },
    ],
  },

  {
    id: "settings",
    title: "הגדרות המערכת",
    blurb: "תצורת שערי תשלום, אימייל, ופרטי החשבון.",
    items: [
      {
        id: "setup-sola",
        title: "חיבור Sola Payments / Cardknox",
        path: "Settings → Payment gateway",
        steps: [
          "Settings → 'Sola Payments / Cardknox' (קופסה ירוקה).",
          "Paste את כתובת ה-PaymentSITE שלך מ-Cardknox.",
          "Save gateway URL.",
          "בקטע 'Sola credentials': הזן xKey (transaction key) ו-ifields key.",
          "Save Sola credentials.",
          "מעכשיו תוכל לבצע חיובים דרך New payment.",
        ],
      },
      {
        id: "setup-email",
        title: "חיבור Resend לשליחת אימיילים",
        path: "Settings → Email",
        steps: [
          "Settings → קטע 'Email'.",
          "From: הזן 'Your Org Name <office@yourdomain.org>'.",
          "Email signature: HTML שיתווסף לסוף כל אימייל.",
          "Resend API key: התחבר ל-resend.com → הצא API key חדש → הדבק.",
          "Save.",
          "Test: 'Send test email to:' עם כתובת שלך → אם הגיע, הכל מחובר.",
        ],
        tips: [
          "כדי לשלוח מ-yourdomain.org נדרש אימות דומיין ב-Resend (SPF + DKIM + MX). זה תהליך חד-פעמי.",
        ],
      },
      {
        id: "settings-other",
        title: "הגדרות נוספות",
        path: "Settings",
        steps: [
          "Sola Sync: סנכרון תשלומים שבוצעו ישירות ב-Cardknox עם המערכת.",
          "Email signature: חתימת HTML שתתווסף אוטומטית לכל אימייל יוצא.",
          "Reminders lead time: כמה ימים מראש לשלוח תזכורות (default: 7).",
        ],
      },
    ],
  },

  {
    id: "shortcuts",
    title: "קיצורי מקלדת וטיפים מתקדמים",
    blurb: "פעולות מהירות לחיסכון בזמן.",
    items: [
      {
        id: "command-palette",
        title: "Command Palette (חיפוש מהיר)",
        path: "כל מקום: ⌘K (Mac) / Ctrl+K (Windows)",
        steps: [
          "לחץ ⌘K (או Ctrl+K) מכל מקום במערכת.",
          "הקלד שם תורם / קמפיין / פעולה.",
          "Enter על תוצאה — מנווט ישר.",
          "מהיר בהרבה משימוש בסרגל העליון.",
        ],
      },
      {
        id: "esc-modal",
        title: "Esc סוגר מודאלים",
        steps: ["לחיצה על מקש Escape סוגרת כל מודאל פתוח בלי שמירה."],
      },
      {
        id: "direct-donor-payment",
        title: "תשלום ישיר לתורם דרך URL",
        steps: [
          "אם יודעים את ה-ID של התורם: /fundraising/payment?donor=DONOR_ID",
          "הדף נטען עם התורם כבר בחור — מדלגים על שלב החיפוש.",
        ],
      },
      {
        id: "filter-pledge-url",
        title: "ראיית תשלומים של פלאג ספציפי",
        steps: [
          "מהמודאל של פלאג: לחץ 'View payments'.",
          "או ישירות: /fundraising/payments?pledge_id=PLEDGE_ID",
          "באנר כחול יופיע בראש הדף עם 'Clear pledge filter' לחזרה לכל התשלומים.",
        ],
      },
    ],
  },
];

// === הקומפוננטה ===

export default function HelpIndex() {
  const [openCategoryIds, setOpenCategoryIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  function toggleCategory(id: string) {
    const next = new Set(openCategoryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenCategoryIds(next);
  }

  function expandAll() {
    setOpenCategoryIds(new Set(CATEGORIES.map((c) => c.id)));
  }

  function collapseAll() {
    setOpenCategoryIds(new Set());
  }

  // חיפוש — מסנן פריטים בכל הקטגוריות. אם יש תוצאה, הקטגוריה נחשבת פתוחה אוטומטית.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((cat) => {
      const items = cat.items.filter((item) => {
        const haystack = [
          item.title,
          item.blurb || "",
          item.path || "",
          ...item.steps,
          ...(item.tips || []),
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      });
      return { ...cat, items };
    }).filter((cat) => cat.items.length > 0);
  }, [search]);

  // כשמחפשים, פותחים אוטומטית את כל הקטגוריות עם תוצאות.
  const isExpanded = (id: string): boolean => {
    if (search.trim()) return true;
    return openCategoryIds.has(id);
  };

  return (
    <div style={{ direction: "rtl", fontFamily: "'Frank Ruhl Libre', 'David', serif", textAlign: "right" }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: "0 0 12px", color: "rgba(10,16,25,0.75)" }}>
          מדריך שימוש מלא בכל פעולות המערכת. לחץ על קטגוריה כדי לפתוח, או חפש פעולה ספציפית בתיבת החיפוש.
        </p>

        {/* קישורי הורדה — קובץ Markdown מלא יותר עם פרוזה מורחבת לעומק. שמור בתיקיית
            public/docs כדי שיוגש כתוכן סטטי על-ידי Next.js. */}
        <div
          style={{
            background: "rgba(28,93,142,0.06)",
            border: "1px solid rgba(28,93,142,0.2)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--blueprint)" }}>
              📄 מדריך משתמש מלא (קובץ להורדה)
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
              מדריך מורחב, מודפס, כולל FAQ והוראות setup ראשוני.
            </div>
          </div>
          <a
            href="/docs/manual.html"
            target="_blank"
            rel="noopener"
            style={{
              padding: "8px 14px",
              background: "var(--blueprint)",
              color: "#fff",
              textDecoration: "none",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            👁 פתח מדריך מעוצב (HTML)
          </a>
          <a
            href="/docs/manual.md"
            download="easyfundraisings-manual.md"
            style={{
              padding: "8px 14px",
              background: "#fff",
              color: "var(--blueprint)",
              textDecoration: "none",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 12,
              border: "1px solid rgba(28,93,142,0.3)",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            ⬇ הורד Markdown
          </a>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש פעולה… (לדוגמה: 'שמירת כרטיס')"
            style={{
              flex: 1,
              minWidth: 240,
              padding: "9px 14px",
              border: "1px solid rgba(10,16,25,0.14)",
              borderRadius: 8,
              fontSize: 14,
              fontFamily: "inherit",
              direction: "rtl",
              textAlign: "right",
              outline: "none",
              background: "#fff",
            }}
          />
          <button
            onClick={expandAll}
            style={{
              padding: "9px 14px",
              background: "transparent",
              border: "1px solid rgba(10,16,25,0.14)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            הרחב הכל
          </button>
          <button
            onClick={collapseAll}
            style={{
              padding: "9px 14px",
              background: "transparent",
              border: "1px solid rgba(10,16,25,0.14)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            צמצם הכל
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: 30,
            background: "rgba(10,16,25,0.03)",
            borderRadius: 10,
            textAlign: "center",
            color: "rgba(10,16,25,0.55)",
            fontSize: 14,
          }}
        >
          לא נמצאו פעולות מתאימות לחיפוש.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((cat) => {
            const expanded = isExpanded(cat.id);
            return (
              <div
                key={cat.id}
                style={{
                  border: "1px solid rgba(10,16,25,0.1)",
                  borderRadius: 10,
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => toggleCategory(cat.id)}
                  style={{
                    width: "100%",
                    background: expanded ? "rgba(10,16,25,0.04)" : "#fff",
                    border: "none",
                    padding: "14px 18px",
                    cursor: "pointer",
                    textAlign: "right",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: "var(--cast-iron)" }}>
                      {cat.title}
                    </div>
                    {cat.blurb && (
                      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2, fontWeight: 500 }}>
                        {cat.blurb}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        opacity: 0.5,
                        padding: "2px 8px",
                        background: "rgba(10,16,25,0.05)",
                        borderRadius: 99,
                        fontFamily: "system-ui, sans-serif",
                      }}
                    >
                      {cat.items.length}
                    </span>
                    <span style={{ fontSize: 14, opacity: 0.5 }}>{expanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expanded && (
                  <div style={{ padding: "4px 18px 18px" }}>
                    {cat.items.map((item) => (
                      <article
                        key={item.id}
                        id={`help-${item.id}`}
                        style={{
                          padding: "14px 0",
                          borderTop: "1px solid rgba(10,16,25,0.06)",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 6px",
                            fontSize: 15,
                            fontWeight: 800,
                            color: "var(--cast-iron)",
                          }}
                        >
                          {item.title}
                        </h4>
                        {item.path && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--blueprint)",
                              fontWeight: 600,
                              marginBottom: 8,
                              direction: "ltr",
                              textAlign: "right",
                              fontFamily: "ui-monospace, monospace",
                            }}
                          >
                            📍 {item.path}
                          </div>
                        )}
                        {item.blurb && (
                          <p style={{ margin: "0 0 8px", fontSize: 13, opacity: 0.75, lineHeight: 1.6 }}>
                            {item.blurb}
                          </p>
                        )}
                        <ol style={{ paddingRight: 22, margin: "0 0 8px", fontSize: 14, lineHeight: 1.8, color: "rgba(10,16,25,0.85)" }}>
                          {item.steps.map((step, i) => (
                            <li key={i} style={{ marginBottom: 3 }}>{step}</li>
                          ))}
                        </ol>
                        {item.tips && item.tips.length > 0 && (
                          <div
                            style={{
                              background: "rgba(240,168,48,0.10)",
                              border: "1px solid rgba(240,168,48,0.25)",
                              borderRadius: 8,
                              padding: "8px 12px",
                              fontSize: 13,
                              lineHeight: 1.6,
                              color: "#5a3a00",
                            }}
                          >
                            <strong style={{ display: "block", marginBottom: 4, fontSize: 11, letterSpacing: "0.04em" }}>
                              💡 טיפ
                            </strong>
                            {item.tips.map((t, i) => (
                              <div key={i} style={{ marginBottom: i === item.tips!.length - 1 ? 0 : 4 }}>
                                {t}
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11, opacity: 0.5, textAlign: "right", direction: "rtl" }}>
        סך הכל {CATEGORIES.reduce((s, c) => s + c.items.length, 0)} פעולות מתועדות ב-{CATEGORIES.length} קטגוריות.
      </div>
    </div>
  );
}
