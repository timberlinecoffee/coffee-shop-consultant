// TIM-867: Fictional coffee shop personas for per-field "see an example" popover.
// Three distinct shops so users see variety instead of one plan repeated.
// Voice mandate: no em dashes, no banned words, realistic owner voice.

export interface FieldExample {
  shopName: string;
  shopType: string;
  answer: string;
}

export type FieldExampleKey =
  | "shop_identity"
  | "vision"
  | "target_customer"
  | "differentiation"
  | "brand_voice"
  | "location"
  | "offering"
  | "great_visit"
  | "vision_synthesized"
  | "neighborhood"
  | "ideal_customer"
  | "pre_post_visit"
  | "target_synthesized"
  | "gap_noticed"
  | "closest_competitor"
  | "unique_offering"
  | "diff_synthesized";

export const FIELD_EXAMPLES: Record<FieldExampleKey, FieldExample[]> = {
  shop_identity: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Maple & Main. Named for the intersection where we sit. Short, easy to say, and it always points people in the right direction.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Drift Coffee. The name came from the feeling we wanted in the space. Slow, unhurried, a little removed from the pace outside.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "The Commons. We wanted people to feel like this place belonged to the neighborhood, not to us. The name needed to say that.",
    },
  ],

  vision: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "We're a drive-through on a corner in Medford. We make genuinely good coffee, fast, and we're done by 2pm. If we can be the best part of someone's morning without taking up too much of it, we're doing our job.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "A coffee bar for people who care about where their coffee comes from. We rotate roasters every few weeks, run a real pour-over program, and hire staff who can talk about what they're making without making it a whole thing. The coffee is the point.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "A place for the neighborhood to land. No wifi, no rush. You can come in for a quick drip or sit for two hours and no one bothers you. We serve the people who've been on this block for 40 years alongside the people who just moved in.",
    },
  ],

  target_customer: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Morning commuters and tradespeople who are out the door before 7am. They want something genuinely good and they can't wait in a long line. If we can be their automatic stop five days a week, we're doing our job.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Specialty coffee people, but not precious ones. Someone who has opinions about natural process Ethiopians but doesn't want to be lectured. Also the remote worker who needs a real third place with good light and no one hovering.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "The whole block. Long-time Hamtramck residents, the families who moved in over the past decade, retirees who drink drip and younger folks who want a real espresso. We're not trying to pick one group.",
    },
  ],

  differentiation: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "We're the only drive-through in the county using specialty-grade beans with a barista who actually knows espresso. Everyone else is on commercial roasters. We hold a quality line that nobody nearby holds, and we do it through a window in two minutes.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Direct relationships with three roasters, two of them too small to supply anyone else in the city. When our guests ask where the coffee is from, we can tell them exactly who picked it and when. That kind of sourcing takes years to build and is not easy to copy.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "We don't have wifi. That's not an oversight. It's a decision. People come here because they want to be around other people. The regulars bring their neighbors. We've never run an ad and we've been full on weekday mornings since month four.",
    },
  ],

  brand_voice: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Warm, no-nonsense, quick. We talk the way our customers talk. No tasting notes unless someone asks. The feeling is: we know your order, we're glad you came, have a good day.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Knowledgeable without being condescending. We care deeply about the product and we let that show without making customers feel like they have to care as much as we do. Honest, curious, low-key.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Unhurried and real. We don't use words like artisanal or curated. If something is good, we say it's good. The voice is your neighbor who also happens to make excellent coffee.",
    },
  ],

  location: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Corner of Maple and Main in Medford, strip mall lot. Hardware store on one side, dry cleaner on the other. High car traffic, almost no foot traffic. Everything comes through the window.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "NW 23rd, Pearl District. Real foot traffic and real rents. We chose this block because the office buildings two streets over fill out by 9am and again at lunch. Walk-up window plus about 20 seats inside.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Jos Campau corridor in Hamtramck. Old commercial strip, half occupied. We picked this spot because the community already gathered here for the Polish and Bangladeshi restaurants on either side. We added a cafe into an ecosystem that already existed.",
    },
  ],

  offering: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru, Medford OR",
      answer:
        "Espresso drinks, drip, and a rotating seasonal latte. Grab-and-go pastries from a local bakery, nothing made in-house. Menu on a chalkboard. We don't do complicated syrups or seasonal specials. What you see is what you get.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar, Portland OR",
      answer:
        "Espresso program, pour-over bar, cold brew made in-house. Small food menu: two pastries, one grain bowl, and a rotating seasonal option. We change the pour-over rotation every two weeks based on what the roasters send us.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe, Hamtramck MI",
      answer:
        "Drip, a simple espresso bar, and a full breakfast menu until noon. Pierogies and eggs after that. We serve what the neighborhood wants at prices the neighborhood can afford. Average ticket is around nine dollars.",
    },
  ],

  // Onboarding guided-screen fields

  great_visit: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "They ordered at the window, got their coffee in under two minutes, and didn't have to think about it. No wait, no confusion, good coffee. That's a good visit.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "They asked what we were pouring, we gave them a real answer without a speech, and they left curious enough to try something they wouldn't have normally ordered.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "They ran into a neighbor they hadn't seen in months. The coffee was good. They sat longer than they planned and didn't feel bad about it.",
    },
  ],

  vision_synthesized: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "We're a drive-through on a corner in Medford. Coffee is the point: fast, good, consistent. We want to be the best part of your morning without taking up too much of it.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "A coffee bar for people who care what they're drinking. Single-origin, rotating roasters, staff who know what they're talking about without making it a whole thing.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "A neighborhood gathering spot where the coffee is good and no one rushes you. No wifi, no agenda. The whole block is welcome here.",
    },
  ],

  neighborhood: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "Strip mall on a state highway outside Medford. Construction crews heading to job sites, morning commuters going toward downtown, families from the neighborhoods behind the mall.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "Pearl District, Portland. Tech workers, designers, people who moved here for the restaurant and coffee scene. High density of remote workers between 9am and 3pm.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "Hamtramck, Michigan. Working families, long-time Polish-American residents, Bangladeshi and Yemeni immigrant families who arrived over the past 20 years, younger renters who moved here because Detroit proper was too expensive.",
    },
  ],

  ideal_customer: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "A construction foreman who stops every morning at 5:45, orders the same thing, and tips two dollars. He knows our names and we know his. If we lose him, we feel it that week.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "A freelance designer who works at the back table three days a week. Buys two drinks, sometimes a pastry. Tells her friends about us. Leaves a review without being asked.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "A 70-year-old who has lived on this block for 40 years. Drinks drip, reads the paper, talks to anyone who comes in. He's the first one to tell a new customer what to order.",
    },
  ],

  pre_post_visit: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "They drop a kid at school or clock in at a job site. The coffee is the transition between home and work. After, they're already somewhere else.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "They open a laptop at a table somewhere or head into a morning meeting. The visit is how they shift from waking up to actually working.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "Some are heading to church, some to the grocery store. Others just woke up and aren't in a hurry. A lot of our regulars sit for an hour.",
    },
  ],

  target_synthesized: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "Morning commuters and tradespeople who want something genuinely good and genuinely fast. They're out the door before 7am and a long wait is not an option.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "Specialty coffee people who don't want to be impressed and remote workers who need a real third place. They care about what they drink and they want to be around other people who do too.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "The whole neighborhood. Long-time residents and new arrivals, every generation, every shift. We're not trying to pick one person. We're trying to serve the block.",
    },
  ],

  gap_noticed: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "Every drive-through around here uses commercial beans. The coffee is an afterthought. There was a real gap for quality in a fast format, and nobody had filled it.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "Portland has a lot of specialty cafes but most rotate the same two roasters and never change. We wanted to be the place that felt like a live thing, updating itself based on what was interesting right now.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "This corner had nothing that served everybody. The newer places coming in were aimed at one crowd. The long-time spots were closing. There was a gap for somewhere that made everyone on the block feel welcome.",
    },
  ],

  closest_competitor: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "Dutch Bros about two miles away. Friendly and fast, and people love them. We can't beat them on volume or marketing. We win on quality and on actually knowing people's names.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "Coava and Water Avenue. Both are genuinely excellent. We're smaller and more focused. We're not trying to build a roastery. We want to source the most interesting coffees we can find and let the cup do the talking.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "The breakfast spots on Jos Campau. They have the food, we have the coffee. Some people go to both. We don't think of them as the competition.",
    },
  ],

  unique_offering: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "The only specialty-grade drive-through in the county. That's the whole thing. One clear advantage, stated plainly.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "We rotate pour-over roasters every two weeks and post why we chose each one. No other cafe in this neighborhood does that kind of curation with that kind of transparency.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "No wifi. People come here because they want to actually be somewhere. That's rare. It also means our regulars come back because they like being around other people, not just because we're convenient.",
    },
  ],

  diff_synthesized: [
    {
      shopName: "Maple & Main Drive-Through",
      shopType: "small-town drive-thru",
      answer:
        "We're the only specialty-grade drive-through in this part of the county. Better coffee than anyone nearby, in the same time frame people are already used to.",
    },
    {
      shopName: "Drift Coffee",
      shopType: "third-wave specialty bar",
      answer:
        "We rotate roasters every two weeks and we can tell you the story behind every coffee we're pouring. That kind of sourcing relationship takes years to build and is genuinely hard to replicate.",
    },
    {
      shopName: "The Commons Cafe",
      shopType: "community cafe",
      answer:
        "No wifi, real food, and a room where people actually talk to each other. We don't run ads. Our regulars send us their neighbors. That kind of loyalty takes consistency over years, not a marketing budget.",
    },
  ],
};
