"use client";

import { FeedbackForm } from "@/components/feedback-form";
import { logStaffFeedback } from "@/app/staff/requests/actions";

export function StaffFeedback({ requestId }: { requestId: string }) {
  return (
    <FeedbackForm
      prompt="Log feedback you heard from the partner (phone call, visit, email). Rating is optional."
      ratingRequired={false}
      thanks="Feedback saved."
      onSubmit={({ rating, body }) => logStaffFeedback({ requestId, rating, body })}
    />
  );
}
