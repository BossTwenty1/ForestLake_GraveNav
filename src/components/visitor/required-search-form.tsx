"use client";

import Form from "next/form";
import { type FormEvent, type ReactNode } from "react";

export function RequiredSearchForm({ className, children }: { className: string; children: ReactNode }) {
  const message = "Enter a name or plot reference before searching.";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const queryField = event.currentTarget.elements.namedItem("query");
    const query = queryField instanceof HTMLInputElement ? queryField.value : "";

    if (!query.trim()) {
      event.preventDefault();
      if (queryField instanceof HTMLInputElement) {
        queryField.setAttribute("aria-invalid", "true");
        queryField.setCustomValidity(message);
        queryField.reportValidity();
      }
      return;
    }

    if (queryField instanceof HTMLInputElement) {
      queryField.removeAttribute("aria-invalid");
      queryField.setCustomValidity("");
    }
  }

  function handleInput(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "query" && target.value.trim()) {
      target.removeAttribute("aria-invalid");
      target.setCustomValidity("");
    }
  }

  return (
    <Form action="/results" className={className} noValidate onInput={handleInput} onSubmit={handleSubmit}
      role="search" aria-label="Memorial search">
      {children}
    </Form>
  );
}
