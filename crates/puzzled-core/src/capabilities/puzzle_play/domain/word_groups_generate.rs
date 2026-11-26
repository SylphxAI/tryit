//! Deterministic word-groups generation from a curated bank and frozen LCG shuffle.
//! The client gets shuffled words only; the server keeps groupings for SubmitGuess.

mod generate;
#[cfg(test)]
mod tests;

use super::word_groups::{TOTAL_CATEGORIES, WORDS_PER_CATEGORY};
pub use generate::generate_word_groups_puzzle;

type BankCategory = (&'static str, [&'static str; WORDS_PER_CATEGORY]);
type BankPuzzle = [BankCategory; TOTAL_CATEGORIES];

// The identity test reads every literal here. Seed slots and levels follow source order.
const BANK: &[BankPuzzle] = &[
    [
        ("FRUITS", ["APPLE", "BANANA", "ORANGE", "GRAPE"]),
        ("COLORS", ["RED", "BLUE", "GREEN", "YELLOW"]),
        ("PLANETS", ["MARS", "VENUS", "SATURN", "JUPITER"]),
        ("CARD SUITS", ["HEART", "DIAMOND", "CLUB", "SPADE"]),
    ],
    [
        ("PETS", ["DOG", "CAT", "HAMSTER", "RABBIT"]),
        ("MUSIC GENRES", ["ROCK", "JAZZ", "POP", "BLUES"]),
        ("BODY PARTS", ["HEAD", "HAND", "FOOT", "BACK"]),
        ("_____ BOARD", ["CHALK", "SKATE", "SURF", "SNOW"]),
    ],
    [
        ("BREAKFAST FOODS", ["BACON", "EGGS", "TOAST", "PANCAKE"]),
        ("TYPES OF DANCE", ["SALSA", "TANGO", "WALTZ", "SWING"]),
        ("CHESS PIECES", ["KING", "QUEEN", "ROOK", "KNIGHT"]),
        ("GO ___", ["FISH", "FIGURE", "BANANAS", "GETTER"]),
    ],
    [
        ("WEATHER", ["RAIN", "SNOW", "WIND", "HAIL"]),
        ("SPORTS EQUIPMENT", ["BALL", "RACKET", "HELMET", "GLOVE"]),
        ("COMPUTER PARTS", ["MOUSE", "SCREEN", "CHIP", "DRIVE"]),
        ("THINGS WITH KEYS", ["PIANO", "LOCK", "MAP", "KEYBOARD"]),
    ],
    [
        ("VEGETABLES", ["CARROT", "POTATO", "ONION", "PEPPER"]),
        ("MOVIE GENRES", ["ACTION", "COMEDY", "HORROR", "DRAMA"]),
        ("GREEK LETTERS", ["ALPHA", "BETA", "GAMMA", "DELTA"]),
        ("THINGS THAT CRASH", ["WAVE", "PARTY", "STOCK", "SYSTEM"]),
    ],
    [
        ("COUNTRIES", ["FRANCE", "JAPAN", "BRAZIL", "EGYPT"]),
        (
            "PRECIOUS STONES",
            ["RUBY", "EMERALD", "SAPPHIRE", "DIAMOND"],
        ),
        ("UNITS OF TIME", ["SECOND", "MINUTE", "HOUR", "WEEK"]),
        ("_____ JACK", ["BLACK", "LUMBER", "CRACKER", "FLAP"]),
    ],
    [
        ("OCEAN CREATURES", ["SHARK", "WHALE", "DOLPHIN", "OCTOPUS"]),
        (
            "MUSICAL INSTRUMENTS",
            ["GUITAR", "PIANO", "VIOLIN", "DRUMS"],
        ),
        (
            "OLYMPIC SPORTS",
            ["SWIMMING", "FENCING", "ARCHERY", "DIVING"],
        ),
        ("TYPES OF SHOT", ["MOON", "CHEAP", "LONG", "SNAP"]),
    ],
    [
        (
            "CITRUS FRUITS",
            ["LEMON", "LIME", "GRAPEFRUIT", "TANGERINE"],
        ),
        ("CAR BRANDS", ["FORD", "HONDA", "TOYOTA", "BMW"]),
        ("ELEMENTS", ["GOLD", "SILVER", "IRON", "COPPER"]),
        ("WORDS BEFORE \"HOUSE\"", ["WHITE", "GREEN", "POWER", "DOG"]),
    ],
    [
        ("DESSERTS", ["CAKE", "PIE", "COOKIE", "BROWNIE"]),
        (
            "SOCIAL MEDIA",
            ["TWITTER", "FACEBOOK", "INSTAGRAM", "TIKTOK"],
        ),
        ("CARD GAMES", ["POKER", "BRIDGE", "RUMMY", "BLACKJACK"]),
        ("WORDS WITH DOUBLE O", ["MOON", "BOOK", "FOOT", "COOL"]),
    ],
    [
        (
            "KITCHEN APPLIANCES",
            ["OVEN", "BLENDER", "TOASTER", "MICROWAVE"],
        ),
        (
            "SUPERHEROES",
            ["BATMAN", "SUPERMAN", "SPIDERMAN", "IRONMAN"],
        ),
        (
            "TYPES OF BREAD",
            ["SOURDOUGH", "BAGUETTE", "CIABATTA", "BRIOCHE"],
        ),
        ("_____ LIGHT", ["FLASH", "HIGH", "SPOT", "LIME"]),
    ],
    [
        ("FLOWERS", ["ROSE", "TULIP", "DAISY", "LILY"]),
        (
            "PIZZA TOPPINGS",
            ["PEPPERONI", "MUSHROOM", "OLIVE", "SAUSAGE"],
        ),
        (
            "SHAKESPEARE PLAYS",
            ["HAMLET", "OTHELLO", "MACBETH", "TEMPEST"],
        ),
        ("THINGS THAT ARE CUT", ["DEAL", "CORNER", "CLASS", "RUG"]),
    ],
    [
        ("SEASONS", ["SPRING", "SUMMER", "FALL", "WINTER"]),
        ("US STATES", ["TEXAS", "FLORIDA", "ALASKA", "CALIFORNIA"]),
        ("POKER TERMS", ["FOLD", "RAISE", "CALL", "BLUFF"]),
        ("COLD _____", ["TURKEY", "SHOULDER", "FEET", "CASE"]),
    ],
    [
        ("BEVERAGES", ["COFFEE", "TEA", "JUICE", "SODA"]),
        ("DOG BREEDS", ["POODLE", "BEAGLE", "BULLDOG", "HUSKY"]),
        ("SPACE TERMS", ["ORBIT", "GALAXY", "ASTEROID", "COMET"]),
        ("THINGS WITH RINGS", ["SATURN", "TREE", "PHONE", "CIRCUS"]),
    ],
    [
        ("FOOTWEAR", ["BOOTS", "SNEAKERS", "SANDALS", "HEELS"]),
        ("CURRENCIES", ["DOLLAR", "EURO", "YEN", "POUND"]),
        (
            "MAGIC WORDS",
            ["ABRACADABRA", "PRESTO", "ALAKAZAM", "HOCUS"],
        ),
        ("TYPES OF POOL", ["CAR", "GENE", "SWIMMING", "TYPING"]),
    ],
    [
        ("NUTS", ["ALMOND", "WALNUT", "CASHEW", "PECAN"]),
        (
            "STREAMING SERVICES",
            ["NETFLIX", "HULU", "DISNEY", "AMAZON"],
        ),
        (
            "WIND INSTRUMENTS",
            ["FLUTE", "CLARINET", "SAXOPHONE", "TRUMPET"],
        ),
        ("BREAK A _____", ["LEG", "SWEAT", "RECORD", "PROMISE"]),
    ],
    [
        (
            "TROPICAL FRUITS",
            ["MANGO", "PAPAYA", "COCONUT", "PINEAPPLE"],
        ),
        (
            "BOARD GAMES",
            ["CHESS", "CHECKERS", "BACKGAMMON", "DOMINOES"],
        ),
        ("TYPES OF WAVES", ["RADIO", "SOUND", "BRAIN", "HEAT"]),
        ("_____ BALL", ["BASE", "VOLLEY", "BASKET", "SNOW"]),
    ],
    [
        (
            "FAST FOOD CHAINS",
            ["MCDONALDS", "WENDYS", "SUBWAY", "TACO"],
        ),
        (
            "MYTHICAL CREATURES",
            ["DRAGON", "UNICORN", "PHOENIX", "GRIFFIN"],
        ),
        ("FILM NOIR ELEMENTS", ["SHADOW", "FEMME", "SMOKE", "RAIN"]),
        ("RED _____", ["CARPET", "HERRING", "FLAG", "TAPE"]),
    ],
    [
        ("DAIRY PRODUCTS", ["MILK", "CHEESE", "YOGURT", "BUTTER"]),
        ("ZODIAC SIGNS", ["LEO", "VIRGO", "ARIES", "TAURUS"]),
        ("TYPES OF TRIANGLE", ["RIGHT", "ACUTE", "OBTUSE", "SCALENE"]),
        ("_____ MARKET", ["SUPER", "FLEA", "STOCK", "BLACK"]),
    ],
    [
        ("ASIAN CUISINES", ["SUSHI", "PHO", "CURRY", "DIMSUM"]),
        (
            "VIDEO GAME CONSOLES",
            ["PLAYSTATION", "XBOX", "NINTENDO", "SEGA"],
        ),
        (
            "ART MOVEMENTS",
            ["BAROQUE", "CUBISM", "SURREALISM", "IMPRESSIONISM"],
        ),
        ("THINGS WITH TAILS", ["MONKEY", "COAT", "FAIRY", "COCKTAIL"]),
    ],
    [
        ("OFFICE SUPPLIES", ["STAPLER", "PENCIL", "SCISSORS", "TAPE"]),
        (
            "HARRY POTTER HOUSES",
            ["GRYFFINDOR", "SLYTHERIN", "RAVENCLAW", "HUFFLEPUFF"],
        ),
        ("CHEMICAL COMPOUNDS", ["WATER", "SALT", "SUGAR", "ALCOHOL"]),
        ("FULL _____", ["MOON", "HOUSE", "CIRCLE", "STEAM"]),
    ],
    [
        ("TREES", ["OAK", "MAPLE", "PINE", "BIRCH"]),
        ("PROGRAMMING LANGUAGES", ["PYTHON", "JAVA", "RUBY", "SWIFT"]),
        ("TYPES OF CHEESE", ["CHEDDAR", "BRIE", "GOUDA", "PARMESAN"]),
        ("_____ WORK", ["FRAME", "FIRE", "DREAM", "NET"]),
    ],
    [
        ("BIRDS", ["EAGLE", "HAWK", "OWL", "FALCON"]),
        (
            "PASTA SHAPES",
            ["PENNE", "SPAGHETTI", "FUSILLI", "RIGATONI"],
        ),
        ("POKER HANDS", ["FLUSH", "STRAIGHT", "PAIR", "FULL"]),
        ("WILD _____", ["CARD", "WEST", "FIRE", "GOOSE"]),
    ],
    [
        ("CONSTRUCTION TOOLS", ["HAMMER", "SAW", "DRILL", "WRENCH"]),
        ("DISNEY PRINCESSES", ["ARIEL", "BELLE", "JASMINE", "MULAN"]),
        ("WINE TYPES", ["MERLOT", "CABERNET", "PINOT", "CHARDONNAY"]),
        ("DOUBLE _____", ["DUTCH", "CHECK", "TAKE", "AGENT"]),
    ],
    [
        ("CANDY", ["CHOCOLATE", "GUMMY", "LOLLIPOP", "CARAMEL"]),
        (
            "FAMOUS SCIENTISTS",
            ["EINSTEIN", "NEWTON", "DARWIN", "CURIE"],
        ),
        ("POKER ACTIONS", ["BET", "CHECK", "RAISE", "FOLD"]),
        (
            "THINGS THAT ARE STRUCK",
            ["LIGHTNING", "DEAL", "POSE", "NERVE"],
        ),
    ],
    [
        ("CAMPING GEAR", ["TENT", "SLEEPING", "LANTERN", "COMPASS"]),
        (
            "SMARTPHONE BRANDS",
            ["APPLE", "SAMSUNG", "GOOGLE", "ONEPLUS"],
        ),
        ("POKER VARIANTS", ["TEXAS", "OMAHA", "STUD", "DRAW"]),
        ("FIRE _____", ["FIGHTER", "FLY", "PLACE", "ARM"]),
    ],
    [
        (
            "CLEANING PRODUCTS",
            ["SOAP", "BLEACH", "DETERGENT", "SPONGE"],
        ),
        ("MARVEL AVENGERS", ["THOR", "HULK", "WIDOW", "HAWKEYE"]),
        ("TYPES OF ENERGY", ["SOLAR", "WIND", "NUCLEAR", "HYDRO"]),
        ("HOT _____", ["DOG", "SHOT", "POTATO", "TUB"]),
    ],
    [
        (
            "PIZZA TYPES",
            ["PEPPERONI", "MARGHERITA", "HAWAIIAN", "SUPREME"],
        ),
        (
            "ANCIENT CIVILIZATIONS",
            ["ROMAN", "GREEK", "EGYPTIAN", "MAYAN"],
        ),
        ("TYPES OF BANK", ["BLOOD", "MEMORY", "FOOD", "RIVER"]),
        ("SWEET _____", ["TOOTH", "TALK", "HEART", "SIXTEEN"]),
    ],
    [
        ("BREAKFAST DRINKS", ["COFFEE", "ORANGE", "MILK", "TEA"]),
        ("ROCK BANDS", ["QUEEN", "ACDC", "METALLICA", "NIRVANA"]),
        ("CARD GAME TERMS", ["TRUMP", "TRICK", "HAND", "DECK"]),
        ("BIG _____", ["BANG", "APPLE", "FOOT", "DEAL"]),
    ],
    [
        ("WINTER SPORTS", ["SKIING", "HOCKEY", "SKATING", "CURLING"]),
        (
            "COFFEE DRINKS",
            ["ESPRESSO", "LATTE", "CAPPUCCINO", "MOCHA"],
        ),
        ("GRAMMAR TERMS", ["NOUN", "VERB", "ADJECTIVE", "ADVERB"]),
        ("BLIND _____", ["DATE", "SPOT", "FOLD", "SIDE"]),
    ],
    [
        (
            "SALAD INGREDIENTS",
            ["LETTUCE", "TOMATO", "CUCUMBER", "CROUTON"],
        ),
        (
            "JAMES BOND ACTORS",
            ["CONNERY", "MOORE", "BROSNAN", "CRAIG"],
        ),
        ("TYPES OF TEST", ["BLOOD", "DRIVING", "STRESS", "LITMUS"]),
        ("SHORT _____", ["CIRCUIT", "CUT", "HAND", "CHANGE"]),
    ],
    [
        ("HERBS", ["BASIL", "MINT", "OREGANO", "THYME"]),
        ("STAR WARS CHARACTERS", ["LUKE", "VADER", "YODA", "LEIA"]),
        ("MUSIC TEMPOS", ["ALLEGRO", "ADAGIO", "PRESTO", "LARGO"]),
        ("BRAIN _____", ["STORM", "WASH", "FREEZE", "DEAD"]),
    ],
    [
        ("SUSHI TYPES", ["NIGIRI", "SASHIMI", "MAKI", "TEMAKI"]),
        ("BOND GIRLS", ["HONEY", "OCTOPUSSY", "JINX", "VESPER"]),
        ("CLOUD TYPES", ["CUMULUS", "STRATUS", "CIRRUS", "NIMBUS"]),
        ("GOLDEN _____", ["GATE", "RETRIEVER", "RULE", "AGE"]),
    ],
    [
        ("SOUP TYPES", ["TOMATO", "CHICKEN", "MINESTRONE", "CLAM"]),
        (
            "LORD OF THE RINGS",
            ["FRODO", "GANDALF", "ARAGORN", "LEGOLAS"],
        ),
        ("MEASUREMENT UNITS", ["METER", "GRAM", "LITER", "KELVIN"]),
        ("POWER _____", ["PLANT", "POINT", "PLAY", "NAP"]),
    ],
    [
        (
            "ICE CREAM FLAVORS",
            ["VANILLA", "CHOCOLATE", "STRAWBERRY", "MINT"],
        ),
        ("GREEK GODS", ["ZEUS", "POSEIDON", "HADES", "APOLLO"]),
        (
            "LEGAL TERMS",
            ["PLAINTIFF", "DEFENDANT", "VERDICT", "APPEAL"],
        ),
        ("BLACK _____", ["FRIDAY", "SHEEP", "MARKET", "HOLE"]),
    ],
    [
        (
            "BERRIES",
            ["BLUEBERRY", "RASPBERRY", "BLACKBERRY", "STRAWBERRY"],
        ),
        (
            "FRIENDS CHARACTERS",
            ["ROSS", "RACHEL", "MONICA", "CHANDLER"],
        ),
        (
            "TYPES OF ROCK",
            ["IGNEOUS", "SEDIMENTARY", "METAMORPHIC", "VOLCANIC"],
        ),
        ("PAPER _____", ["WORK", "BACK", "CLIP", "WEIGHT"]),
    ],
    [
        ("SANDWICH TYPES", ["BLT", "CLUB", "REUBEN", "GRILLED"]),
        ("PIXAR MOVIES", ["TOY", "FINDING", "MONSTERS", "CARS"]),
        ("POKER CHIPS", ["WHITE", "RED", "GREEN", "BLACK"]),
        ("MIND _____", ["READER", "BLOWING", "GAME", "FIELD"]),
    ],
    [
        (
            "MEXICAN FOOD",
            ["TACO", "BURRITO", "QUESADILLA", "ENCHILADA"],
        ),
        ("MARVEL VILLAINS", ["THANOS", "LOKI", "ULTRON", "MAGNETO"]),
        ("BALLET TERMS", ["PLIÉ", "PIROUETTE", "ARABESQUE", "JETÉ"]),
        ("FACE _____", ["TIME", "VALUE", "PALM", "LIFT"]),
    ],
    [
        ("BARBECUE ITEMS", ["RIBS", "BRISKET", "SAUSAGE", "CHICKEN"]),
        ("DC HEROES", ["SUPERMAN", "BATMAN", "WONDER", "AQUAMAN"]),
        (
            "PERIODIC TABLE GROUPS",
            ["NOBLE", "ALKALI", "HALOGEN", "METAL"],
        ),
        ("HAND _____", ["SHAKE", "OUT", "MADE", "BOOK"]),
    ],
    [
        ("SEAFOOD", ["SHRIMP", "LOBSTER", "CRAB", "OYSTER"]),
        ("NINTENDO CHARACTERS", ["MARIO", "LINK", "KIRBY", "PIKACHU"]),
        (
            "WEATHER PHENOMENA",
            ["TORNADO", "HURRICANE", "TSUNAMI", "EARTHQUAKE"],
        ),
        ("BACK _____", ["DOOR", "FIRE", "TRACK", "BONE"]),
    ],
    [
        ("ITALIAN FOOD", ["PIZZA", "PASTA", "RISOTTO", "LASAGNA"]),
        (
            "GAME OF THRONES HOUSES",
            ["STARK", "LANNISTER", "TARGARYEN", "BARATHEON"],
        ),
        (
            "ORCHESTRA SECTIONS",
            ["STRING", "BRASS", "WOODWIND", "PERCUSSION"],
        ),
        ("RUNNING _____", ["MATE", "WATER", "START", "JOKE"]),
    ],
];
