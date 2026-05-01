import { createUploadUrlHandler } from "@nkps/shared/lib/upload-url-handler";

// ERP-side signed-upload-URL endpoint. Used by the staff page for staff
// profile photos. Avatar uploads go through /api/portal/avatar instead
// (server-side direct upload, no signed URL needed).
const BUCKET_RULES = {
  "staff-photos": {
    exts: ["jpg", "jpeg", "png", "webp"],
    description: "staff profile photos",
  },
};

export const POST = createUploadUrlHandler({ bucketRules: BUCKET_RULES });
