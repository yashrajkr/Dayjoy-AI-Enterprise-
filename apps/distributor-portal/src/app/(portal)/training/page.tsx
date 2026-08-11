"use client";

import { GraduationCap } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function TrainingPage() {
  return (
    <ComingSoon
      title="Training"
      description="Courses, webinars, and certification programs."
      icon={GraduationCap}
      features={[
        "Self-paced courses with progress tracking",
        "Live webinar calendar + recordings",
        "Skill assessments and certificates",
        "Compensation plan deep-dives",
      ]}
    />
  );
}
