export type SubscriptionPlan = "starter" | "growth" | "enterprise";

export interface SubscriptionTier {
  plan: SubscriptionPlan;
  name: string;
  price: string;
  limits: string;
  features: string[];
  highlighted?: boolean;
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    plan: "starter",
    name: "Starter",
    price: "PHP 999/mo",
    limits: "5 listings, 50 applicants/mo",
    features: ["Pipeline", "DocuSeal", "Applicant portal"],
  },
  {
    plan: "growth",
    name: "Growth",
    price: "PHP 2,499/mo",
    limits: "20 listings, 300 applicants/mo",
    features: ["AI scoring", "AI resume parsing", "Analytics"],
    highlighted: true,
  },
  {
    plan: "enterprise",
    name: "Enterprise",
    price: "PHP 5,999/mo",
    limits: "Unlimited",
    features: ["Priority support", "Custom contract templates", "Employee portal"],
  },
];

export function isSubscriptionPlan(value: string | null | undefined): value is SubscriptionPlan {
  return value === "starter" || value === "growth" || value === "enterprise";
}

export function getSubscriptionTier(plan: SubscriptionPlan) {
  return SUBSCRIPTION_TIERS.find((tier) => tier.plan === plan) ?? SUBSCRIPTION_TIERS[0];
}