export const PRIMARY_NICHES = {
  Beauty_Skincare: "Skincare, makeup, aesthetics, wigs",
  Men_Grooming: "Men's grooming, beard care, fragrance, styling",
  Fashion_Apparel: "Everyday clothing, shoes, bags, outfits, accessories",
  Luxury_Jewelry: "Accessible luxury, jewelry, watches",
  Tech_Gadgets: "Consumer electronics, smart home, drones, desk setups",
  Software_SaaS_AI: "AI tools, productivity software, apps, Web3 or crypto products",
  Gaming_Esports: "Console or mobile game reviews, streams, esports gear",
  Fitness_Wellness: "Gym workouts, yoga, supplements, fat loss",
  Outdoor_Adventure: "Camping, hiking, fishing, skiing, extreme sports",
  Home_Living: "Home decor, kitchen, appliances, lifestyle vlogs",
  Food_Cooking: "Food, restaurant visits, baking, quick recipes, drinks",
  Parenting_Kids: "Parenting, baby products, children's toys",
  Pet_Care: "Cat and dog products, pet content, exotic pets",
  Automotive_Vehicles: "Cars, EVs, motorcycles, cycling",
  Finance_Investing: "Personal finance, stocks, crypto investing, property",
  Education_Career: "Language learning, careers, study abroad, exams",
  Arts_DIY_Crafts: "Crafts, painting, 3D printing, design",
  Entertainment_Humor: "Comedy, street interviews, film and anime, music and dance",
  Other: "The bio is too thin, or no single niche is clearly primary",
} as const;

export type PrimaryNiche = keyof typeof PRIMARY_NICHES;

export const NICHE_QUESTION = {
  primary_niche: {
    type: "choice",
    instructions:
      "Choose the creator's single primary niche from the display name and bio. Use only those fields. Do not infer from a search keyword, and do not invent content that is not written. Choose Other when the bio is too thin, or when several niches are present and none is clearly primary.",
    criteria: PRIMARY_NICHES,
  },
} as const;

export function isPrimaryNiche(value: string): value is PrimaryNiche {
  return Object.prototype.hasOwnProperty.call(PRIMARY_NICHES, value);
}
