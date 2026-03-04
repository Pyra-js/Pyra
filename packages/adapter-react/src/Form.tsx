import { createElement, useState } from "react";
import type { FormHTMLAttributes, ReactNode } from "react";
import { useNavigate } from "./hooks.js";

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method" | "onSubmit"> {
  /** The API route path to submit to (e.g. "/api/posts"). */
  action: string;
  /** HTTP method to use. Defaults to "POST". */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /**
   * What to do after a successful submission.
   * - A string: navigate to that path
   * - A function: called with the parsed response JSON
   */
  onSuccess?: string | ((data: unknown) => void);
  /**
   * Called when the submission fails (non-2xx response or network error).
   * Receives the error.
   */
  onError?: (error: Error) => void;
  children: ReactNode;
}

/**
 * A form component that submits to a Pyra API route and handles the response
 * automatically. Prevents the default browser form submission and uses `fetch`
 * instead, serialising fields as JSON (POST/PUT/PATCH/DELETE) or as query
 * params (GET).
 *
 * On success: navigates to `onSuccess` if it's a string, or calls it if it's
 * a function. On error: calls `onError` if provided.
 *
 * @example
 * <Form action="/api/posts" method="POST" onSuccess="/dashboard">
 *   <input name="title" placeholder="Post title" required />
 *   <textarea name="body" placeholder="Write something..." required />
 *   <button type="submit">Publish</button>
 * </Form>
 *
 * @example
 * <Form
 *   action="/api/posts"
 *   method="DELETE"
 *   onSuccess={(data) => console.log("Deleted", data)}
 *   onError={(err) => alert(err.message)}
 * >
 *   <button type="submit">Delete post</button>
 * </Form>
 */
export function Form({
  action,
  method = "POST",
  onSuccess,
  onError,
  children,
  ...props
}: FormProps) {
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);

      let url = action;
      let body: string | undefined;
      const headers: Record<string, string> = {};

      if (method === "GET") {
        const params = new URLSearchParams();
        formData.forEach((value, key) => params.append(key, String(value)));
        url = action + "?" + params.toString();
      } else {
        const obj: Record<string, unknown> = {};
        formData.forEach((value, key) => { obj[key] = value; });
        body = JSON.stringify(obj);
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(url, { method, body, headers });

      if (!res.ok) {
        const message = await res.text().catch(() => res.statusText);
        throw new Error(message || `Request failed with status ${res.status}`);
      }

      const data = await res.json().catch(() => null);

      if (typeof onSuccess === "string") {
        navigate(onSuccess);
      } else if (typeof onSuccess === "function") {
        onSuccess(data);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSubmitting(false);
    }
  }

  return createElement(
    "form",
    { ...props, onSubmit: handleSubmit, "data-submitting": submitting || undefined },
    children,
  );
}
