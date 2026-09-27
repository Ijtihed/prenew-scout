/**
 * Games creators are tagged with. `platform` drives niche fit: Prenew sells gaming PCs, so an
 * audience that plays on PC is a closer fit than a mobile-only one. `proven` marks games from
 * Prenew's past collaborations.
 */
export type GamePlatform = 'pc' | 'mixed' | 'console' | 'mobile';

export interface Game {
   name: string;
   /** Regex source (word-bounded when used) for names people type. */
   aliases: string;
   genres: string[];
   platform: GamePlatform;
   proven?: boolean;
   /** Relative share of creators in the mock data. */
   weight: number;
}

export const GAMES: Game[] = [
   { name: 'Minecraft', aliases: 'minecraft|mc', genres: ['survival', 'sandbox', 'kids'], platform: 'mixed', proven: true, weight: 8 },
   { name: 'Fortnite', aliases: 'fortnite|fn', genres: ['battle royale', 'shooter', 'kids'], platform: 'mixed', proven: true, weight: 8 },
   { name: 'Roblox', aliases: 'roblox', genres: ['sandbox', 'kids'], platform: 'mixed', weight: 6 },
   { name: 'GTA', aliases: 'gta ?(?:v|5|vi|6|online)?|grand theft auto(?: v| vi)?', genres: ['open world', 'action'], platform: 'mixed', proven: true, weight: 5 },
   { name: 'CS2', aliases: 'cs2|cs ?go|cs|counter[- ]?strike(?: 2)?', genres: ['shooter', 'fps', 'esports'], platform: 'pc', proven: true, weight: 5 },
   { name: 'Valorant', aliases: 'valorant|valo', genres: ['shooter', 'fps', 'esports'], platform: 'pc', weight: 4 },
   { name: 'League of Legends', aliases: 'league of legends|league|lol', genres: ['moba', 'esports'], platform: 'pc', weight: 4 },
   { name: 'Call of Duty', aliases: 'call of duty|cod|warzone|black ops(?: \\d+)?|bo\\d', genres: ['shooter', 'fps', 'battle royale'], platform: 'mixed', weight: 4 },
   { name: 'Apex Legends', aliases: 'apex(?: legends)?', genres: ['shooter', 'battle royale'], platform: 'mixed', weight: 3 },
   { name: 'EA FC', aliases: 'ea ?(?:sports )?fc(?: ?2\\d)?|fc ?2\\d|fifa|ultimate team', genres: ['sports', 'football'], platform: 'console', weight: 4 },
   { name: 'Rocket League', aliases: 'rocket league|rl', genres: ['sports', 'esports'], platform: 'mixed', weight: 2 },
   { name: 'Overwatch 2', aliases: 'overwatch(?: 2)?|ow2?', genres: ['shooter', 'hero shooter'], platform: 'mixed', weight: 2 },
   { name: 'Marvel Rivals', aliases: 'marvel rivals|rivals', genres: ['shooter', 'hero shooter'], platform: 'mixed', weight: 3 },
   { name: 'Rainbow Six Siege', aliases: 'rainbow six(?: siege)?|r6(?: siege)?|siege', genres: ['shooter', 'fps', 'esports'], platform: 'mixed', weight: 2 },
   { name: 'Battlefield 6', aliases: 'battlefield(?: 6)?|bf6?', genres: ['shooter', 'fps'], platform: 'mixed', weight: 3 },
   { name: 'PUBG', aliases: 'pubg|battlegrounds', genres: ['shooter', 'battle royale'], platform: 'pc', weight: 2 },
   { name: 'Escape from Tarkov', aliases: 'tarkov|eft|escape from tarkov', genres: ['shooter', 'extraction', 'survival'], platform: 'pc', weight: 2 },
   { name: 'The Finals', aliases: 'the finals', genres: ['shooter', 'fps'], platform: 'pc', weight: 1 },
   { name: 'Delta Force', aliases: 'delta force', genres: ['shooter', 'extraction'], platform: 'pc', weight: 1 },
   { name: 'Arc Raiders', aliases: 'arc raiders', genres: ['shooter', 'extraction'], platform: 'pc', weight: 2 },
   { name: 'Dota 2', aliases: 'dota(?: 2)?', genres: ['moba', 'esports'], platform: 'pc', weight: 2 },
   { name: 'Deadlock', aliases: 'deadlock', genres: ['moba', 'shooter'], platform: 'pc', weight: 1 },
   { name: 'Teamfight Tactics', aliases: 'tft|teamfight tactics', genres: ['strategy', 'autobattler'], platform: 'pc', weight: 1 },
   { name: 'Rust', aliases: 'rust', genres: ['survival'], platform: 'pc', weight: 2 },
   { name: 'ARK', aliases: 'ark(?: survival(?: evolved| ascended)?)?', genres: ['survival'], platform: 'pc', proven: true, weight: 2 },
   { name: 'DayZ', aliases: 'dayz', genres: ['survival'], platform: 'pc', weight: 1 },
   { name: 'Palworld', aliases: 'palworld', genres: ['survival', 'open world'], platform: 'pc', weight: 1 },
   { name: 'Terraria', aliases: 'terraria', genres: ['survival', 'sandbox'], platform: 'pc', weight: 1 },
   { name: 'Valheim', aliases: 'valheim', genres: ['survival'], platform: 'pc', weight: 1 },
   { name: 'Elden Ring', aliases: 'elden ring|nightreign|dark souls|souls ?likes?|souls(?: games)?', genres: ['rpg', 'soulslike'], platform: 'mixed', proven: true, weight: 2 },
   { name: "Baldur's Gate 3", aliases: "baldur'?s gate(?: 3)?|bg3", genres: ['rpg'], platform: 'pc', weight: 1 },
   { name: 'Cyberpunk 2077', aliases: 'cyberpunk(?: 2077)?', genres: ['rpg', 'open world'], platform: 'pc', weight: 1 },
   { name: 'Path of Exile 2', aliases: 'path of exile(?: 2)?|poe ?2?', genres: ['rpg', 'arpg'], platform: 'pc', weight: 1 },
   { name: 'Diablo IV', aliases: 'diablo(?: iv| 4)?', genres: ['rpg', 'arpg'], platform: 'mixed', weight: 1 },
   { name: 'World of Warcraft', aliases: 'world of warcraft|wow', genres: ['mmo', 'rpg'], platform: 'pc', weight: 2 },
   { name: 'Monster Hunter Wilds', aliases: 'monster hunter(?: wilds)?|mh ?wilds', genres: ['rpg', 'action'], platform: 'mixed', weight: 1 },
   { name: 'Genshin Impact', aliases: 'genshin(?: impact)?', genres: ['gacha', 'rpg', 'anime'], platform: 'mixed', weight: 2 },
   { name: 'Honkai: Star Rail', aliases: 'honkai(?:: star rail| star rail)?|hsr', genres: ['gacha', 'rpg', 'anime'], platform: 'mixed', weight: 1 },
   { name: 'Zenless Zone Zero', aliases: 'zenless(?: zone zero)?|zzz', genres: ['gacha', 'action', 'anime'], platform: 'mixed', weight: 1 },
   { name: 'Helldivers 2', aliases: 'helldivers(?: 2)?', genres: ['shooter', 'coop'], platform: 'mixed', weight: 1 },
   { name: 'Lethal Company', aliases: 'lethal company', genres: ['horror', 'coop'], platform: 'pc', weight: 1 },
   { name: 'R.E.P.O.', aliases: 'r\\.?e\\.?p\\.?o\\.?', genres: ['horror', 'coop'], platform: 'pc', weight: 1 },
   { name: 'Peak', aliases: 'peak', genres: ['coop'], platform: 'pc', weight: 1 },
   { name: 'Schedule I', aliases: 'schedule (?:i|1|one)', genres: ['simulator', 'coop'], platform: 'pc', weight: 1 },
   { name: 'Phasmophobia', aliases: 'phasmophobia|phasmo', genres: ['horror', 'coop'], platform: 'pc', weight: 1 },
   { name: 'Silent Hill f', aliases: 'silent hill(?: f)?', genres: ['horror'], platform: 'mixed', weight: 1 },
   { name: 'WARDOGS', aliases: 'wardogs', genres: [], platform: 'mixed', weight: 1 },
   { name: 'Dead by Daylight', aliases: 'dead by daylight|dbd', genres: ['horror'], platform: 'mixed', weight: 1 },
   { name: 'Among Us', aliases: 'among us', genres: ['party', 'kids'], platform: 'mixed', weight: 1 },
   { name: 'Hollow Knight: Silksong', aliases: 'silksong|hollow knight', genres: ['indie', 'platformer'], platform: 'mixed', weight: 1 },
   { name: 'The Sims 4', aliases: 'the sims(?: 4)?|sims ?4?', genres: ['simulator', 'cozy'], platform: 'pc', weight: 2 },
   { name: 'Stardew Valley', aliases: 'stardew(?: valley)?', genres: ['cozy', 'indie'], platform: 'mixed', weight: 1 },
   { name: 'Farming Simulator 25', aliases: 'farming sim(?:ulator)?(?: 25)?|fs25', genres: ['simulator', 'cozy'], platform: 'pc', weight: 1 },
   { name: 'Euro Truck Simulator 2', aliases: 'euro truck(?: sim(?:ulator)?)?(?: 2)?|ets2', genres: ['simulator', 'racing'], platform: 'pc', weight: 1 },
   { name: 'Forza Horizon', aliases: 'forza(?: horizon)?(?: \\d)?', genres: ['racing'], platform: 'mixed', weight: 1 },
   { name: 'F1 25', aliases: 'f1(?: ?2\\d)?|formula 1', genres: ['racing', 'sports'], platform: 'mixed', weight: 1 },
   { name: 'Mario Kart World', aliases: 'mario kart(?: world)?', genres: ['racing', 'kids'], platform: 'console', weight: 1 },
   { name: 'Pokémon', aliases: 'pok[eé]mon|pokemon legends', genres: ['rpg', 'kids'], platform: 'console', weight: 2 },
   { name: 'NBA 2K', aliases: 'nba ?2k(?: ?2\\d)?', genres: ['sports'], platform: 'console', weight: 1 },
   { name: 'Clash Royale', aliases: 'clash royale|cr', genres: ['mobile', 'strategy'], platform: 'mobile', proven: true, weight: 2 },
   { name: 'Clash of Clans', aliases: 'clash of clans|coc', genres: ['mobile', 'strategy'], platform: 'mobile', weight: 1 },
   { name: 'Brawl Stars', aliases: 'brawl stars', genres: ['mobile', 'shooter'], platform: 'mobile', weight: 2 },
   { name: 'Sea of Thieves', aliases: 'sea of thieves|sot', genres: ['coop', 'open world'], platform: 'mixed', weight: 1 },
   { name: 'Warframe', aliases: 'warframe', genres: ['shooter', 'coop'], platform: 'pc', weight: 1 },
   { name: 'Destiny 2', aliases: 'destiny(?: 2)?', genres: ['shooter', 'mmo'], platform: 'mixed', weight: 1 },
   { name: 'Hearthstone', aliases: 'hearthstone', genres: ['card', 'strategy'], platform: 'mixed', weight: 1 },
   // Gaming channels without one main game (the crawler's fallback).
   { name: 'Variety gaming', aliases: 'variety gaming|gaming channel', genres: [], platform: 'mixed', weight: 0 },
   { name: 'PC builds', aliases: 'pc builds?|building (?:a )?pcs?|hardware|pc tech|tech reviews?|gpus?|graphics cards?', genres: ['tech'], platform: 'pc', proven: true, weight: 3 },
   { name: 'Setup tours', aliases: 'setups?|setup tours?|desk setups?|battlestations?', genres: ['tech'], platform: 'pc', weight: 2 },
   { name: 'Gaming news', aliases: 'gaming news|news', genres: ['news'], platform: 'mixed', proven: true, weight: 1 },
];

/** Genre words people type, mapped onto the tags above. */
export const GENRE_WORDS: [string, string][] = [
   ['shooters?|fps|first[- ]person shooters?|gunplay', 'shooter'],
   ['battle ?royales?|br', 'battle royale'],
   ['mobas?', 'moba'],
   ['survival(?: games)?', 'survival'],
   ['sandbox(?: games)?', 'sandbox'],
   ['rpgs?|role[- ]playing', 'rpg'],
   ['arpgs?|action rpgs?', 'arpg'],
   ['souls ?likes?', 'soulslike'],
   ['mmos?|mmorpgs?', 'mmo'],
   ['gacha|anime games?', 'gacha'],
   ['horror(?: games)?|scary games?', 'horror'],
   ['co-?op(?: games)?|friend games?|with friends', 'coop'],
   ['cozy(?: games)?|chill games?', 'cozy'],
   ['sim(?:ulator)?s?|simulation games?', 'simulator'],
   ['racing(?: games)?|driving(?: games)?', 'racing'],
   ['sports? games?|sports', 'sports'],
   ['football(?: games)?|soccer', 'football'],
   ['esports?|competitive', 'esports'],
   ['mobile(?: games?| gaming)?', 'mobile'],
   ['strategy(?: games)?', 'strategy'],
   ['kids(?: games)?|family(?: games)?', 'kids'],
   ['indie(?: games)?', 'indie'],
   ['open[- ]world(?: games)?', 'open world'],
   ['extraction(?: shooters?)?', 'extraction'],
   ['tech(?: creators?| channels?)?', 'tech'],
];

export const GENRE_LABEL: Record<string, string> = {
   shooter: 'Shooters', 'battle royale': 'Battle royale', moba: 'MOBA', survival: 'Survival', sandbox: 'Sandbox', rpg: 'RPG',
   arpg: 'Action RPG', soulslike: 'Soulslike', mmo: 'MMO', gacha: 'Gacha', horror: 'Horror', coop: 'Co-op', cozy: 'Cozy',
   simulator: 'Simulator', racing: 'Racing', sports: 'Sports', football: 'Football', esports: 'Esports', mobile: 'Mobile',
   strategy: 'Strategy', kids: 'Kids', indie: 'Indie', 'open world': 'Open world', extraction: 'Extraction', tech: 'Tech',
};

/** A creator matches if one of their games is in every requested genre ("horror co-op" = both). */
export const playsGenres = (games: string[], genres: string[]) =>
   games.some((n) => {
      const g = gameByName(n);
      return !!g && genres.every((x) => g.genres.includes(x));
   });

export const GAME_NAMES = GAMES.map((g) => g.name);
export const gameByName = (name: string) => GAMES.find((g) => g.name === name);
export const gamesInGenre = (genre: string) => GAMES.filter((g) => g.genres.includes(genre)).map((g) => g.name);
