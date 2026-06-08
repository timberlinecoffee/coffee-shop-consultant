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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart, Denver CO",
      answer:
        "Copper and Wheel. The copper came from the color of the first espresso machine I saved up for. The wheel is literal. We go where the people are. It needed to be easy to say when someone is describing us to a friend.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe, Nashville TN",
      answer:
        "Lowland Roasters. The name comes from the geography of Middle Tennessee. We wanted something that sounded like it had been there a while and pointed somewhere specific rather than describing what we do.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart, Denver CO",
      answer:
        "A cart at three weekly markets and a daily office stop in RiNo. We make one style of coffee well: pulled tight, served fast, nothing over 12 ounces. If someone comes back to the market specifically to find us, that is the job done.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe, Nashville TN",
      answer:
        "A production roastery first. The cafe is the front window to what we make. Walk-in customers can watch a roast from their bar stool. The coffee we serve by the cup is the same coffee we sell wholesale to fifteen restaurant accounts in Nashville. If a guest asks where to get our coffee after they leave, we want two answers: our bags, and one of the restaurants we supply.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart, Denver CO",
      answer:
        "Farmers market regulars who already care about where their food comes from. The kind of person who stops at the vegetable stand and asks about the farm. When they ask us about the origin, we have an answer. The other group is office workers at the daily stop. They want something genuinely good in under three minutes and they have stopped going to the chain across the street.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe, Nashville TN",
      answer:
        "Two groups. First are specialty coffee people who have heard about us through the restaurant accounts and want to taste the sourcing directly. Second are regular neighborhood walk-ins who do not care about the roastery. They just want a good cup in a calm room. We need both to cover the rent on a production facility with a cafe attached.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart, Denver CO",
      answer:
        "We are the only cart in the Denver market circuit running a real single-origin program. The farmers market crowd is already buying direct-trade food. We fit that ethos in the cup. No syrups, no blended drinks. The quality line is what gets people to find us at a different market when we rotate.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe, Nashville TN",
      answer:
        "We roast in front of the customer. Most wholesale roasters keep production off the floor. We put the Probat where the guest can see it. That is not theater. The roast schedule runs whether anyone is watching. It just happens to be visible. Our wholesale pitch is the same: come see what you are buying.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart, Denver CO",
      answer:
        "Direct and curious. We do not explain ourselves on the menu board. If someone asks, we talk. If they do not ask, we make it fast and good and let them go. The feeling is: we know what we are doing and we are not going to make a whole thing of it.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe, Nashville TN",
      answer:
        "Production-minded but not cold. We are making something and you can watch us make it. The voice on the bag and on the bar board is the same: specific, honest, no performance. We use origin and process names on the menu board but we do not lecture. If you ask, we will talk for twenty minutes.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart, Denver CO",
      answer:
        "RiNo office park on weekday mornings, Boulder farmers market on Saturday, Denver Central Market on Sunday. Custom 8-foot trailer with a La Marzocca GS3. City of Denver mobile vendor permit. The trailer parks off-site and we tow to each spot.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe, Nashville TN",
      answer:
        "Wedgewood-Houston neighborhood, Nashville. 2,400 sq ft: roasting floor in the rear, 18-seat bar along the wall, roasting visible from every bar stool. Loading dock on the side street for green coffee delivery. Three blocks from Nations neighborhood foot traffic.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart, Denver CO",
      answer:
        "Six drinks: espresso, cortado, flat white, oat milk latte, drip from the same origin, and a rotating cold brew. No food. We sell retail bags on weekends. Average ticket is seven dollars.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe, Nashville TN",
      answer:
        "Cafe: espresso program and pour-over only, no blended drinks, no food. Retail: 250g and 500g bags of current offerings, typically three origins. Wholesale: 12kg to 25kg orders for restaurant accounts on a two-week cadence. Average cafe ticket is nine dollars. Wholesale accounts average 18kg per month.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "They ordered a cortado, asked where the coffee was from, and we had a real answer. They paid and kept walking. On their way out of the market they stopped to tell someone else about us. That is the whole thing.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "They came in for a pour-over, watched a roast start while they waited, and asked if they could buy a bag of what was just roasted. We said yes. They asked where else they could get it. We named two restaurants. They went to one the next week.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "A mobile cart at Denver markets and a daily RiNo stop. Single-origin espresso, nothing over 12 ounces, served fast. We want to be the coffee people seek out, not just the coffee that is nearby.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "A production roastery where the public can watch the work. The cafe is the front of the same operation that supplies fifteen Nashville restaurants. Walk in for a coffee. Leave knowing where it came from and where else you can get it.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "Three spots: a Saturday farmers market in Boulder, a Sunday market in Denver, and a weekday stop at an office park in RiNo. Each crowd is slightly different but they all already care about the provenance of what they buy.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "Wedgewood-Houston, Nashville. Former industrial neighborhood with a mix of production spaces, galleries, and restaurants. The foot traffic is not high but the people who come tend to be intentional. Our wholesale accounts started with the restaurants on the same block.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "A freelance designer who hits the Sunday market every week, knows our rotation, and asks when we are getting more of the Kenyan. She bought a bag last month and brought her husband the week after. Those two now show up every Sunday.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "A restaurant buyer who drove forty minutes to taste through the current offerings before placing their next order. She sits at the bar, asks to compare two origins side by side, and ends up buying 20kg on the spot. That visit is worth more than a week of walk-in retail.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "At the market, they are shopping. The coffee is part of the ritual of walking the stalls. At the office stop, they are heading into a workday and the coffee is the transition. In both cases, they are moving and we work within that.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "Walk-in retail customers tend to be out exploring the neighborhood or stopping on a commute through Wedgewood. Wholesale buyers come with a purpose. The two groups do not overlap much but they share the same space and neither seems to mind.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "People who already buy with intention and appreciate when what they drink has a story behind it. They are not looking for the fastest option. They are looking for the best option that fits into the time they have.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "Coffee professionals and specialty buyers who want to taste the sourcing at the source, and neighborhood walk-ins who just want a good cup in a place that takes the coffee seriously. The roastery makes both groups feel like they came to the right place.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "Every other cart at the markets was running commercial beans and flavored syrups. The farmers market crowd was spending twelve dollars on a jar of honey and asking about the beekeeper. Nobody was offering them that kind of story in the coffee.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "I spent eight years selling other roasters' coffee to Nashville restaurants. Every buyer I called had the same question: can I come see where this is made? Nobody local could say yes. We are the answer to that question.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "There is one other cart at the Saturday market. Friendly people, syrup-heavy menu, quick service. We do not compete on speed and we do not compete on sweetness. We compete on the quality of the shot and the story behind it.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "Two Nashville roasters supply some of the same restaurant accounts. Both are good. Neither has a customer-facing production floor. If a buyer wants to see the roast before they commit to a contract, we are the only option.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "The only single-origin espresso cart at any of the three markets we work. Rotating origins, retail bags on weekends, no syrups. If you want a vanilla latte, we are not your stop. If you want to taste the actual coffee, we are.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "The only Nashville roastery where wholesale buyers, retail customers, and walk-in cafe guests all share the same room and watch the same roast. The production floor is not a back-of-house operation. It is the whole point.",
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
    {
      shopName: "Copper & Wheel",
      shopType: "mobile espresso cart",
      answer:
        "Single-origin program on wheels. The markets we work already have customers who buy based on provenance. We give them that in the cup. No syrups, no blended drinks, no compromise on the shot quality just because we are operating from a trailer.",
    },
    {
      shopName: "Lowland Roasters",
      shopType: "production roastery with cafe",
      answer:
        "A production roastery that put the Probat on the cafe floor. Our wholesale pitch is the same as our cafe experience: come see what you are buying. That kind of transparency is not common and it is not easy to copy.",
    },
  ],
};
