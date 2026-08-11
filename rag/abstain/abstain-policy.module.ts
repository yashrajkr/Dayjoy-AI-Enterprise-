import { Module } from "@nestjs/common";
import { AbstainPolicyService } from "./abstain-policy.service";

@Module({
  providers: [AbstainPolicyService],
  exports: [AbstainPolicyService],
})
export class AbstainPolicyModule {}
