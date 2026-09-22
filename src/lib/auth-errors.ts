/** ترجمة رسائل المصادقة وقاعدة البيانات إلى العربية حتى لا تظهر رسائل إنجليزية للمستخدم. */
const RULES: Array<{ test: RegExp; message: string }> = [
  { test: /already registered|already exists|duplicate key/i, message: "هذا الرقم مسجّل بالفعل، سجّل الدخول" },
  { test: /invalid login credentials/i, message: "الرقم أو كلمة السر غير صحيحة" },
  { test: /password.*(6|short|least)/i, message: "كلمة السر 6 أحرف أو أرقام على الأقل" },
  { test: /invalid.*email|email address.*invalid/i, message: "اكتب رقم هاتف صحيح" },
  { test: /email not confirmed/i, message: "لم يتم تأكيد الحساب بعد" },
  { test: /rate limit|too many requests/i, message: "محاولات كثيرة، انتظر قليلًا ثم أعد المحاولة" },
  { test: /network|fetch failed|timeout/i, message: "تعذر الاتصال بالخدمة، تحقق من الإنترنت" },
  { test: /permission denied|not authorized|unauthorized|row-level security/i, message: "لا تملك صلاحية لهذه العملية" },
  { test: /user not found/i, message: "الحساب غير موجود" },
  { test: /signup.*disabled/i, message: "تسجيل الحسابات متوقف حاليًا" },
  { test: /public_id|display_name.*taken/i, message: "الاسم أو المعرّف مستخدم بالفعل، اختر غيره" },
];

/** يرجع رسالة عربية مفهومة لأي خطأ، مع رسالة بديلة عند عدم التعرف عليه. */
export function authErrorMessage(error: unknown, fallback = "تعذر إتمام العملية"): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";
  if (!raw) return fallback;
  for (const rule of RULES) {
    if (rule.test.test(raw)) return rule.message;
  }
  // لا نعرض أي نص إنجليزي للمستخدم
  if (/^[\x20-\x7E]+$/.test(raw)) return fallback;
  return raw;
}
