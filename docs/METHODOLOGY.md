# Methodology

How Scout finds creators, what every number means, how it is computed, and why it is built that way.
Everything here is derived from public data (the YouTube Data API, YouTube autocomplete, TikTok's public creator embed) or from
the team's own actions in the app. Where a value is an assumption rather than a measurement, it says so.

## 1. Finding creators

**Where candidates come from.** Eight sources feed one queue:
1. Searches for each game in each market's language, limited to that country ("minecraft dansk", "fortnite
   deutsch").
2. The same searches sorted newest first. These find smaller, currently active channels, which relevance
   search buries under established ones.
3. YouTube autocomplete in each market's language. Autocomplete reflects what real people in that market
   search for, and it names local creators ("minecraft suomi kakkuh").
4. @mentions in creators' descriptions, since creators collaborate with and shout out their peers.
5. The channels a creator features on their own page: friends and collab partners.
6. People who comment on a creator's Shorts: small creators often comment on bigger ones in their scene.
7. A name search for every creator that qualifies, which surfaces their collab partners.
8. Prenew's past partners as seeds.

Sources 4 to 7 follow the network rather than search, and they found about 60% of the creators so far. They
reach creators too small to rank in search.

**Learning which sources pay off.** Every search is credited with the creators it produced. The next searches
and the order in which channels are checked are chosen by measured yield per source and per word, with
smoothing so a single lucky search doesn't dominate. Markets take equal turns, and discovery focuses on the
markets with the fewest creators so far. Measured so far: channels from newest-first searches qualify
about 3 times as often as those from autocomplete or collab searches.

**Who qualifies.** A channel is kept only if all of these hold:

| Check | Rule | Why |
|---|---|---|
| Makes Shorts | At least 8 Shorts | Prenew buys short-form placements; a handful of Shorts is too little to predict from |
| Size | 300 to 2M followers, or fewer (from 100) with a recent Short above 20K views | Mid and small creators give the most engagement per euro; a breakout Short catches growth before prices rise |
| Active | A Short in the last 60 days | Inactive creators can't deliver on time |
| Local | The channel's country, or titles and description mostly in the market's language | The audience has to be in a market Prenew sells in |
| Gaming | Games from the catalog are detected, or gaming words recur | Prenew sells gaming PCs |
| A person | Not a brand, league, media outlet, clip or fan channel (name rules plus a local-model check) | Only individuals can be booked and trusted by their audience |

**TikTok.** TikTok has no open search, so TikTok creators are found across platforms: the TikTok linked in a
YouTube creator's bio (kept if the names match), the YouTube creator's own handle tried on TikTok (kept only
if the TikTok profile points back to them) and @mentions in qualified TikTok creators' captions. Each account
is read from TikTok's official public creator embed: followers, total likes, bio and the latest videos with
play counts; a video's upload date is encoded in its id. The same checks as YouTube apply (size, activity,
language, games, not a brand). TikTok doesn't expose per-video likes or comments there, so TikTok engagement
uses the typical rate and audience language comes from captions and bio.

**Markets.** Finland, Sweden, Germany, Denmark, France, the Netherlands, Belgium, Austria, Poland and the
Baltic states. A creator's market comes from their channel's country setting when present, otherwise from the
language of their titles and description. Belgium and Austria share languages with bigger neighbours, so they
are only ever assigned from the channel country.

**Where the data comes from.** Autocomplete is read from YouTube's public suggestions. Everything else
(searches, channel records, Shorts lists, view/like/comment counts, comments, featured channels, daily
follower counts) comes from the official YouTube Data API within its free daily quota. The channel's own country setting,
when present, decides the market; otherwise the language of titles and description does.

**Politeness.** Every kind of request has its own pace and cool-down. When YouTube slows us down, the crawler
waits and retries later; it never works around a block.

## 2. What we measure per creator

| Signal | How | Notes |
|---|---|---|
| Followers, Shorts, views, likes, dates | YouTube Data API (the channel's Shorts playlist and video statistics) | Exact counts and upload dates |
| Engagement | Likes divided by views over recent Shorts | Comment counts aren't collected; likes are the main reaction on Shorts |
| Posting rhythm | Days between recent Shorts | |
| Views trend | Median views of the newest 6 Shorts vs the ones before | Needs at least 9 Shorts |
| Follower growth | Daily follower snapshots; 7-day change, scaled from the history available once there are 2 days | Unknown until then, shown as "–" |
| Sponsorships | Ad disclosures (#ad, mainos, reklam, Werbung…) or a brand with a discount code or shop link in the latest descriptions | Lines repeated under every video are treated as standing partners, not new deals. Creator codes for games aren't brand deals |
| Sponsor category | A catalog of PC sellers (Prenew's competitors), hardware, game publishers, gambling sites and common sponsors; otherwise the name from the disclosure | |
| Audience language | Share of sampled comments (two recent Shorts, about 60 each) written in the market's language | Needs at least 12 readable comments |
| PC buying interest | Share of comments asking what PC or GPU the creator uses, saying their own PC is too weak, or wanting a PC | The local model reads each hardware-related comment, so jokes and mockery don't count |
| Brand safety | Keywords find candidate lines (casino, deposit codes, 18+, drugs…); the local model confirms each line on its own; gambling sponsors count directly | Every flag keeps the creator's own words as evidence. In-game violence is not a risk |

## 3. The Score

The Score answers "how good a pick is this creator for Prenew right now". Six parts, each a percentile within
the creator's market (0 to 100); the weighted sum is ranked within the market again, so a Score of 80 means
better than about 80% of that market's creators.

| Part | Default weight | What it measures |
|---|---|---|
| Fits Prenew | 25% | How close their games are to PC gaming (and games Prenew has done collabs in), viewers asking about PCs in the comments, past PC or hardware sponsors |
| Audience in the country | 20% | Share of comments written in the market's language; unmeasured creators sit at the market median |
| Audience reacts | 20% | Likes per view compared with creators of the same size (typical: about 5% under 10K followers, 4% to 100K, 2.5% to 500K, 1.5% above) |
| Return per euro | 15% | Expected PCs sold × profit per PC, divided by their likely fee |
| Growth | 12% | Follower growth once measured; until then, recent Shorts vs older ones and vs follower count |
| Posts reliably | 8% | Steady views and regular posting, minus a penalty when more than 30% of recent posts are ads |

**Brand safety** is a requirement, not a weight: creators with a brand-safety flag or a gambling sponsor have
their weighted sum cut by 40% before ranking, and Agent plans leave them out.

**Why these weights.**
- **Match first.** The match between brand and creator (what they play, where their audience is) predicts
  campaign results more than anything else. Campaigns work predictably when most of the audience fits and
  weaken below about 40%. So fit and audience together carry 45%.
- **Engagement quality over follower count.** Engaged audiences are the ones that buy, and smaller creators
  often sell more per follower. Engagement naturally falls as accounts grow, so a creator is compared with
  others of their size; otherwise every large creator would look disengaged.
- **Return on spend.** This is how brands judge success, so expected return per euro counts directly. Views
  per euro would barely differ, since fees are set by views.
- **Growth below those.** Catching creators on the way up is cheaper, but growth predicts results less than
  fit or engagement. The "Catch rising stars" preset puts it first for teams that want that.
- **Too many ads.** Audiences trust creators less when feeds fill with ads, and sponsored posts measurably
  cost creators subscribers, so a feed that is more than 30% ads is marked down.

**Why rank within the market.** A plain weighted sum of percentiles bunches everyone around 50, hiding the
differences that matter, and ranking keeps scores comparable between a small market (Sweden) and a large one
(Germany).

## 4. Prices and money

These are estimates until Prenew's own results replace them. Each follows how sponsored short-form video is
priced and how it performs. The logic lives in `feeFor`, `buyersPer10kFor` and `ASSUMPTIONS` in
`app/lib/data/mock.ts`, and in `expectedPcs` in `app/lib/engine.ts`.

**What a creator charges for one post.**
`fee = (½ × expected views/1,000 × €5 + ½ × followers/1,000 × €20) × market × agency`, and at least €75.

| Part | Value | Reasoning |
|---|---|---|
| Per 1,000 expected views | €5 on YouTube Shorts, €5.50 on TikTok | Sponsored entertainment and gaming Shorts sell at a few euros per 1,000 views, far below finance or tech-review content. Shorts price low: most viewers aren't subscribers, there's little room for an integration and no clickable link |
| Per 1,000 followers | €20 | Creators quote by audience size as much as by views. Market rate cards run from about €25–200 for 1–10K followers, €200–1,500 for 10–100K and €1,500–5,000 above that, which this reproduces together with the view part |
| Half and half | | Small creators are expensive per view because they still charge a real fee; large ones spread the same effort over far more views. Blending both matches that curve |
| Market | Germany 1.0, Sweden 0.9, Finland 0.85 | Germany prices close to the US; smaller markets are cheaper |
| Agency | +10% | Agencies take their commission (typically 10–20%) out of the creator's fee rather than adding it on top, but they negotiate harder |
| Minimum | €75 | Even the smallest creators rarely accept less than a few tens of euros; €75 sits mid-range for creators under 10K followers |
| Range shown | −15% to +20% | Quotes vary around the typical rate |

**Views a sponsored post gets.** The creator's recent median, reduced slightly: 9% for creators under 10K
followers, 6% up to 100K, 4% up to 500K and 2% above. Audiences react a little less to sponsored posts, and
the smallest creators' audiences react the most.

**PCs sold per post.**
`buyers per 10,000 views = 10,000 × engagement rate × code use × high-ticket factor × no-link factor`

| Part | Value | Reasoning |
|---|---|---|
| Engagement rate | likes ÷ views, capped at 12% | Buyers come from viewers who engage; very high rates are usually a few viral posts |
| Code use | 2% low, 3.5% typical, 5% high | The share of an engaged audience that uses a creator's discount code |
| High-ticket factor | 0.28 | Purchases over €500 convert at roughly a quarter of the rate of everyday electronics (about 1–1.5% vs 4.5%) |
| No-link factor | 0.5 | Shorts and TikToks have no clickable link, so viewers must remember the code or look the shop up |
| PC fit | × niche fit ÷ 80 | PC-game audiences are closer to buying a PC than mobile or console ones |
| PC questions | up to +50% | Comments asking about the creator's PC are direct buying interest |
| Real results | × measured ÷ predicted | Once tracked links report sales, predictions are corrected by how real posts performed |

For a typically engaged gaming audience (4%) this gives about 1.1 / 2.0 / 2.8 buyers per 10,000 views.

**Profit per PC: €200.** Refurbishers typically run around 20% gross margin; on a €700–1,500 gaming PC that is
€140–300. Editable in Settings.

**Negotiation.** Open 20% below the expected fee, expect them to ask about 10% above it (20% with an agency),
and walk away above 25%. A creator's first quote is usually their highest, most brands negotiate, and most
creators accept or counter once rather than haggling; beyond +25% the expected return no longer holds.

**Break-even** = fee ÷ profit per PC.

## 5. Agent campaigns

"Reach out to 3 Polish Minecraft creators, €600 in total" becomes a plan: the best-scoring creators that fit
the request and the budget, leaving out past partners, anyone already in outreach, gambling sponsors and
brand-safety risks. The budget is split evenly, and a creator whose usual lowest price is above their share
is skipped because they would say no. Each creator gets a first offer below their limit to leave room to
negotiate. Nothing is sent until the team confirms the plan; then the agent writes each first email in the
creator's language and negotiates within the limits (section 4).

**How the agent learns.** Everything is recomputed from data whenever a campaign is planned or a reply arrives
(`app/lib/learn.ts`), and the Outreach page shows the hit rate and what was learned.
- *From Prenew's past bookings* (the team's collaboration spreadsheet, 69 bookings of 51 creators): 41% of
  bookings went to repeat partners, so past partners are offered again rather than skipped, and candidates
  that look like past bookings (platform, games, size, known partner) rank higher.
- *From its own negotiations:* the first offer opens 15 points below where deals have been closing (after two
  deals; 60–85% of the limit). When deals close within about two messages, it states its maximum after one
  counter. When 30% or more asked for more than the limit, campaigns skip creators whose usual price is above
  it. Each kind of creator (agency or direct, TikTok or YouTube) gets a yes-rate starting from 20% and updated
  with every result; campaigns favour the kinds that say yes.

## 6. Similar creators

Similarity blends shared games (30%), what their titles talk about (30%, weighted so rare words count more
than common ones), follower size (12%), typical views (12%), market (10%) and engagement (6%).

## 7. Where language models are used

Two tiers, both DeepSeek on Featherless, with the local model (qwen3 8B via Ollama) as automatic fallback
when the hosted service is unreachable:
- **Reasoning (DeepSeek V4-Flash with thinking, answers in about 5-10 s):** the Agent chat and edits to
  campaign plans, where the request has to be understood and weighed. Arithmetic the answer depends on, such
  as the best mix of creators for a total budget, is computed exactly in code and handed to the model.
- **Fast (DeepSeek V3, answers directly):** plain-words search, reading creator replies, writing negotiation
  emails in the creator's language, confirming that a channel is an individual gaming creator, labelling
  comments and confirming brand-safety risks.

Models never produce a number, price, prediction or score. Every model answer is checked against the source
text: search filters need matching words in the query, plan edits need the amounts written in the message,
safety flags need a quote from the creator, and the Agent may only use creators and figures it was given.
