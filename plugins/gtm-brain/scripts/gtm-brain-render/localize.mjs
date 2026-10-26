import { DEFAULT_CONTEXTS } from "../../lib/brain.mjs";

const legacyTitles = { company: "Company", icp: "ICP", offer: "Offer" };

// Default context labels are interface text. Keep authored titles, custom names and IDs intact.
export function contextLabel(context) {
  const owner = context.fm?.personal_owner;
  if (owner && context.slug === `personal-${owner}` && context.title === `Personal: ${owner}`) return context.title;
  const seed = DEFAULT_CONTEXTS.find(c => c.slug === context.slug);
  if (!seed || (context.title !== seed.title && context.title !== legacyTitles[context.slug])) return context.title;
  return seed.title;
}
