/** State returned by the auth/account server actions (consumed with `useActionState`). */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      /** Text for the whole form (neutral for login). */
      message: string;
      /** Optional message for one field (e.g. the new code policy). */
      field?: { name: string; message: string };
    }
  | { status: "success"; message: string };

export const IDLE: FormState = { status: "idle" };
