"use client";

import { FeedbackForm } from "@/components/feedback-form";
import { submitPartnerFeedback } from "@/app/status/actions";

export function PartnerFeedback({ code, email }: { code: string; email: string }) {
  return (
    <FeedbackForm
      prompt="How are the devices working out? Your feedback helps us plan and thank our donors."
      ratingRequired
      thanks="Thank you! Your feedback has been sent to the Atlanta Tech Bank team."
      onSubmit={({ rating, body }) => submitPartnerFeedback({ code, email, rating, body })}
    />
  );
}
