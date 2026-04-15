import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface GoLoginProfile {
  id: string
  name: string
  proxyEnabled: boolean
  proxy?: { host?: string; port?: number; mode?: string }
  canBeRunning: boolean
  runDisabledReason?: string | null
  os: string
  browserType: string
  createdAt: string
  updatedAt: string
  navigator?: { userAgent?: string }
  startUrl?: string
  notes?: string
  s3Path?: string
  s3Date?: string
  checkCookies?: boolean
  tags?: string[]
  lockEnabled?: boolean
  autoLang?: boolean
  geolocation?: { fillBasedOnIp?: boolean }
  timezone?: { fillBasedOnIp?: boolean }
}

interface AccountRecord {
  platform: "instagram" | "facebook" | "linkedin"
  index: number
  username?: string
  password?: string
  twofa?: string
  email?: string
  emailPassword?: string
  cookie?: string
  phone?: string
  displayName?: string
  profileUrl?: string
  profileUuid?: string
  goLoginId?: string
  goLoginName?: string
  proxyInfo?: string
  goLoginStatus: "ready" | "no-proxy" | "not-setup"
  // GoLogin live data
  goLoginProfileName?: string
  goLoginCanRun?: boolean
  goLoginRunDisabled?: string | null
  goLoginOS?: string
  goLoginBrowser?: string
  goLoginLastUpdated?: string
  goLoginCreated?: string
  goLoginProxyEnabled?: boolean
  goLoginProxyHost?: string
  goLoginStartUrl?: string
  goLoginHasSession?: boolean
  goLoginUserAgent?: string
  goLoginTags?: string[]
  goLoginLocked?: boolean
  goLoginNotes?: string
}

const GOLOGIN_IDS: Record<string, string> = {
  "instagram_1": "69a4a3dd4172109758da71d1",
  "instagram_2": "69a4a3f0e8ed6d21d1dab88f",
  "instagram_3": "69a4a3f2c7235af0af2fe4d4",
  "instagram_4": "69a4a3f37c294c30f827cced",
  "instagram_5": "69a4a3f4d5d68dd11e5ac885",
  "instagram_6": "69a4a3f582c5099a461fe193",
  "instagram_7": "69a4a3f6efb0fd4a2fe9a91c",
  "instagram_8": "69a4a3f84172109758da9160",
  "instagram_9": "69a4a3f94172109758da9422",
  "instagram_10": "69a4a3fad5d68dd11e5acb76",
  "facebook_1": "69a4a3fb2c59fa363a4d1777",
  "facebook_2": "69a4a3fc82c5099a461fe7b6",
  "facebook_3": "69a4a3fe82c5099a461fe90e",
  "facebook_4": "69a4a3ff3d9ce0afe7c2edeb",
  "facebook_5": "69a4a4003cf3ea5b9af1a206",
  "facebook_6": "69a4a4012c59fa363a4d1bd8",
  "facebook_7": "69a4a4024172109758da98ac",
  "facebook_8": "69a4a404c7235af0af2ff50f",
  "facebook_9": "69a4a40582c5099a461ff2aa",
  "facebook_10": "69a4a4064172109758da9b67",
  "linkedin_1": "69a4a407a2495392a2acc16a",
  "linkedin_2": "69a4a4082c59fa363a4d2379",
  "linkedin_3": "69a4a40a82c5099a461ff641",
  "linkedin_4": "69a4a40b4172109758da9d52",
  "linkedin_5": "69a4a40c2c59fa363a4d2895",
  "linkedin_6": "69a4a40da998b00580d026f0",
  "linkedin_7": "69a4a40e2c59fa363a4d2b28",
  "linkedin_8": "69a4a40f82c5099a461ffc0f",
  "linkedin_9": "69a4a4117c294c30f827f648",
  "linkedin_10": "69a4a4124172109758daa4b5",
}

const ACCOUNTS: AccountRecord[] = [
  { platform: "instagram", index: 1, username: "jo.neseric60", password: "EricJones@87163", twofa: "2XPT Q7Y4 WFYN EYCJ FHCL YMI4 NBLC MS7Y", email: "rcdbelu538@hotmail.com", emailPassword: "psz9SOcwGl5uI", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 2, username: "l.eegary43", password: "GaryLee@37511", twofa: "CP7L VSGQ 2URD IM3M R6LM BFTX 3SFP WIM6", email: "jdqiptzm910@hotmail.com", emailPassword: "2e8LzWpqu", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 3, username: "ramosrya.ne8", password: "RyanRamos@25669", twofa: "LSEJ ZI3U VZID 2QUA P42H SUTX IG5N R64O", email: "pulfjsf8000@hotmail.com", emailPassword: "lFe6eVWIV", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 4, username: "j.ohnsonsteven86", password: "StevenJohnson@93306", twofa: "2YWJ W7IK FPRI T6DP PMPT LUEB VMJ5 O7OW", email: "fwbixquwh775@hotmail.com", emailPassword: "PCPgIuYh2Ci", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 5, username: "m.artindorothyg0", password: "DorothyMartin@63579", twofa: "CWZQ GQY3 WSSR 6UVF HCFE Y4RP JIBI SNZW", email: "okmjwks9877@hotmail.com", emailPassword: "3TlxH7ogX", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 6, username: "davisale.xander9", password: "AlexanderDavis@16723", twofa: "EJ36 YLI6 DEV3 BLO2 ZHDC WD3S CIGG 43MZ", email: "zsgtidza307@hotmail.com", emailPassword: "mcPZ4b76jeSmF", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 7, username: "wilso.nkathleen01", password: "KathleenWilson@31013", twofa: "WATN YI6C TWQV DXJV L3UJ B46G BKA3 FYA4", email: "vrdqzhxk273@hotmail.com", emailPassword: "KVkk5svcwmEZg", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 8, username: "alvarez.john9", password: "JohnAlvarez@9222", twofa: "OXU7 PDBO GGLF 37HV 4CFV ZV53 4HU3 VNVL", email: "wgohpwozhx442@hotmail.com", emailPassword: "yvSjPYk8mEDIY", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 9, username: "bake.rlaura5", password: "LauraBaker@18062", twofa: "RULJ WDNJ RQTG 2ZHQ HG3R WNNB OT3V WABN", email: "cqzoigrv074@hotmail.com", emailPassword: "D5HeCjdua9", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 10, username: "mil.lerlinda43", password: "LindaMiller@6055", twofa: "VP3M BHXX SS5R WLU2 LVK6 WVBW E3UK QPV5", email: "mtkvlnryij432@hotmail.com", emailPassword: "QHLLVE8dipd8", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 11, username: "ortiz.amanda9", password: "AmandaOrtiz@48594", twofa: "3KLQ 4WWI AQ4R 65G2 N5ZD UU2J BCDE 7HMG", email: "ajevyrenzx1573@hotmail.com", emailPassword: "SY26FoOUpD", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 12, username: "p.etersonjustin18", password: "JustinPeterson@39622", twofa: "AUGF TXMJ VGJR N4TG NATC 4HQ4 WVRP XO6F", email: "qbumzonluw257@hotmail.com", emailPassword: "2zDKmu5VKM6By", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 13, username: "joneslinda.2", password: "LindaJones@7057", twofa: "S3J7 AL3H Z75L O6GJ 7RKM ZF7I Z4IW DCC2", email: "qakicasdlt232@hotmail.com", emailPassword: "JWfPJ1PBek", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 14, username: "graya.my7", password: "AmyGray@22968", twofa: "REEB K2C3 D6AT F73O 4D7A O2TH ZTD4 PBA7", email: "fkrwxrkc5040@hotmail.com", emailPassword: "WXEgtsZP9wHVD", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 15, username: "castillochristo.pheri8", password: "ChristopherCastillo@78505", twofa: "VN2O JGOY ZG2V CHAX LU4C 7ZJG QEUX DU57", email: "qrzvtsax281@hotmail.com", emailPassword: "OwEVlXYPZYpNn", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 16, username: "ortizla.rryg3", password: "LarryOrtiz@81302", twofa: "UVG7 LPSS ZIPH MCGU DGNG TRQB R6RS OYPJ", email: "miatsyspj490@hotmail.com", emailPassword: "R0CJJ5zZJP", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 17, username: "andersonja.netz8", password: "JanetAnderson@71388", twofa: "C4Y7 DKNE C2V3 T2DS KJCS GRO3 UUCS GE6A", email: "vyklssk1695@hotmail.com", emailPassword: "a9hZR8awfEfQ", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 18, username: "mend.ozasarah2", password: "SarahMendoza@62634", twofa: "JIKL B7YQ PF2F EVJN KDCP PDY6 BHNA 4RUE", email: "ftepzttf7633@hotmail.com", emailPassword: "UZR7aHlSspCL", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 19, username: "flores.shirley1", password: "ShirleyFlores@3241", twofa: "FW5M D4NP YIFE O4RA JWOK YP3T 3JZD AZNO", email: "zarnmsf8881@hotmail.com", emailPassword: "zsnilQCkzIc7", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 20, username: "youngalexand.er4", password: "AlexanderYoung@14103", twofa: "OKR5 YCIS JO6P LTKJ Z7AM QVKL FQT7 SFNO", email: "mtrkyaexj2659@hotmail.com", emailPassword: "MztN6jq4r5QFM", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 21, username: "robertsmargaret.t1", password: "MargaretRoberts@3973", twofa: "24CR QNSW IA3Y 3LZA N32W ZOVA 2SSR 3HDN", email: "mcbkhcvqe3477@hotmail.com", emailPassword: "qxoQq5P35", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 22, username: "myerse.mily90", password: "EmilyMyers@53761", twofa: "4UMT EFQV T43A D7VN WTCQ WU4Q AUGI XZXG", email: "kcientvytd212@hotmail.com", emailPassword: "fIqKU2gj4I", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 23, username: "ram.ossarahp1", password: "SarahRamos@32074", twofa: "M5FD R5IA JB4D NHQ4 5KA2 GWAB G2YP ES53", email: "pnzlgzmtim9402@hotmail.com", emailPassword: "LfoqdkQXI", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 24, username: "gonzalezmar.y82", password: "MaryGonzalez@6581", twofa: "OJ6G C537 BQYO YN4Y IEAR NN7B XMIE CRCQ", email: "ksbrsjg343@hotmail.com", emailPassword: "ahlAisGDQPCX", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 25, username: "cru.zpatrick52", password: "PatrickCruz@99117", twofa: "XD7D JWPA 2CEM U6XB S3NA QV37 D7XE GQJD", email: "miexftx6896@hotmail.com", emailPassword: "DdPheFPSQ", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 26, username: "g.omezkimberly20", password: "KimberlyGomez@17964", twofa: "NFRQ Z6NI ZXGG 7XBQ BG5C ZPVV YEXE RP5J", email: "uvxvoeh2788@hotmail.com", emailPassword: "jdDBp6qoQkF", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 27, username: "chavezj.erry0", password: "JerryChavez@44979", twofa: "GWPZ KFQ6 T4I3 ANAP HRR5 2DTL 5N3O ZDDW", email: "unazasa4589@hotmail.com", emailPassword: "qWQps6zt0M611", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 28, username: "kellyjos.hua08", password: "JoshuaKelly@5873", twofa: "XM57 GXFL TZVI XD5P K76D HEWE 4TBF 6AI5", email: "egghjfnatp789@hotmail.com", emailPassword: "GFAkc85pK", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 29, username: "moraleshea.ther2", password: "HeatherMorales@29711", twofa: "ON5E HKBD OLPQ 6CUS QBU5 KUTE LQ2D QLFJ", email: "egfpyvfsa9857@hotmail.com", emailPassword: "AtD4B7DtCq", goLoginStatus: "not-setup" as const },
  { platform: "instagram", index: 30, username: "taylorjustin.80", password: "JustinTaylor@7680", twofa: "422S IA33 MIHX FDOB LX32 PHGL FDSL DZ7T", email: "lgxleam717@hotmail.com", emailPassword: "I8DLdChWY", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 1, email: "AlrobalyAnchaib1996@hotmail.com", password: "8D5ZHAFMIYB1V0", twofa: "7XWSGYZSC7IEQ26KYLYP5LHMQ24XNRAF", displayName: "MaryannGeorgia29", phone: "61586348077464", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 2, email: "JonleemarrWilsamkirqa1995@hotmail.com", password: "8FBCUMRA93N1IX", twofa: "HWVVNHUDQ2SJCIYTMTGKUBHNK6ZGJW2J", displayName: "WhitneyShelley18", phone: "61586566020129", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 3, email: "LucarmicoBenelwilbz1986@hotmail.com", password: "8MUHP75ZY2D0NV", twofa: "2X24NTFEXX7EGMM4FN35SNNXEZML3IRK", displayName: "MargieCandice70", phone: "61586298399096", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 4, email: "TaymaraneSonaljondm1980@hotmail.com", password: "8NTEVYIWMP9ZJD", twofa: "3ZMSC5BU2U5L7456QP6XEMDFF4PVAJBV", displayName: "GwenPatsy47", phone: "61586194993305", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 5, email: "ArertoncSamjamjonkx1985@hotmail.com", password: "8OQPRMSI06UTGA", twofa: "DMMQGXVXSNRR7I2SLJ57OIPYKOCRYHFR", displayName: "AlbertaAngie48", phone: "61586161155025", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 6, email: "AlrobalpAlluctonyl1989@hotmail.com", password: "8VKO1S0R3UGZHN", twofa: "IXR2O5CPHICGAQQRUZCUIVU5PR57LPD3", displayName: "FayeInez76", phone: "61586426465609", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 7, email: "ArelpChaantn1980@hotmail.com", password: "9GTJ3I5FLUZVQ4", twofa: "6Z4LYU2TBHQWD3GSGFAPK6T5XIIWSRHR", displayName: "MaryannKayla54", phone: "61586759180860", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 8, email: "TaymictLucpaukr1984@hotmail.com", password: "9HNU8V75EATZBS", twofa: "2IWK72MDI7RWFJ6YSSESGKJF32VZTTLT", displayName: "BrandyBecky51", phone: "61586372706730", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 9, email: "ChaarmicbTayerms1984@hotmail.com", password: "9HVCM8YD635TLZ", twofa: "DVB777C3MGGGSPUU6LWNTF7WHQEBTZ47", displayName: "MelindaCarole99", phone: "61586702423747", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 10, email: "JamrobsEreneu1989@hotmail.com", password: "9KJOZ8SUV15XET", twofa: "5UNBW3W76ZEBYXZNHOOCTOMCULJZ4M4G", displayName: "MarianneSandy07", phone: "61586164365141", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 11, email: "AlchaiMarmarcl1984@hotmail.com", password: "9PQCUW2S1BVJF3", twofa: "AP5JY5ZI3M4MNCMUEDXSCW6BMTEILYLB", displayName: "MamieKay59", phone: "61586147835570", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 12, email: "ElbensambArerchasl1992@hotmail.com", password: "9R5DG8EYTAHQPI", twofa: "SYG5KR2UVBXK2YN3F35N3ZCVQH3GBCPQ", displayName: "JanieDoreen08", phone: "61586422446007", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 13, email: "ErharerwTontonmichd1994@hotmail.com", password: "9SD6IERC7FPK4V", twofa: "GVRR2LSII6STMKJ5526NGW6CWFPHK6OQ", displayName: "VelmaViolet56", phone: "61586547781165", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 14, email: "SamluceTaykirsonwi@hotmail.com", password: "A3H85N41W0926C", twofa: "YDT6NR7Q7ODKX3WZCYZHZNTKDJGUEFMB", displayName: "FayeSilvia03", phone: "61586525882497", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 15, email: "TaywilalaWilsamjamuv1997@hotmail.com", password: "A6X2PYNLGKJCER", twofa: "DURJHY3XJEZHFJ5WWLJMSG6PRLUSDTZK", displayName: "BlancheMiriam93", phone: "61586638886913", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 16, email: "RobsoneriJambensamnw@hotmail.com", password: "ADF7SNH5U81TE6", twofa: "QYV5QX5YKW7HECDJAQCUMKQZGIFBTYMK", displayName: "AngelLula50", phone: "61586275150672", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 17, email: "BenmarleebEnmarjamih2000@hotmail.com", password: "AEGZI7LFM0HPTU", twofa: "KZLCINWVXYJYDVXDL47KGZBPYM4MOWKC", displayName: "BernadetteRoxanne87", phone: "61586656886176", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 18, email: "WiltayaEnarqe@hotmail.com", password: "AHWNBIFV01E5OR", twofa: "7VFHOU6WIZAJ5SU635V4UH576TR2FILW", displayName: "OpalKrista55", phone: "61586512172820", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 19, email: "LeejamfTayleemicsl1998@hotmail.com", password: "ASFH8QR4M37DGE", twofa: "SB6JUBIKXKAPU6X2IHUNURXWZEB4W7NP", displayName: "AllisonLula41", phone: "61586263960988", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 20, email: "PaujongRobalta@hotmail.com", password: "B1VY9T3S8RZX4K", twofa: "YQ47CV76V5P36SSI3JNUKMPAFFL6LVST", displayName: "ClaudiaPam50", phone: "61586375976777", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 21, email: "AlkircSamkirfg1990@hotmail.com", password: "BDLH20YAR1FVPT", twofa: "76JLZNZFBGKD32EWLNTZHL6I5FSQADLG", displayName: "MaggieDelores71", phone: "61586315048581", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 22, email: "JamalwiluRobenbu1991@hotmail.com", password: "BTZOCS1D8AVMWX", twofa: "XZXDJUJEVXL2DXPDB2A6L62TC4FF43MX", displayName: "MargueriteLydia84", phone: "61586151705713", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 23, email: "TonrobzTaykirhc@hotmail.com", password: "BUPTCOXZNHV41F", twofa: "DDX3PVCIFHD652OMS63ER7PM2EKDYUO4", displayName: "TerryMona73", phone: "61586716283178", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 24, email: "AlarmicmMicsonfn1994@hotmail.com", password: "BX5QI2FVYSU9CL", twofa: "XN3S4VLTE7WWRJ4WLMOTLCTUKAX6EB36", displayName: "AngelinaPam96", phone: "61586760200927", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 25, email: "LeeroboEnerjambg@hotmail.com", password: "C4WHDPXME7LITG", twofa: "WHYUHFBBBA4SKHQ2WTAUST45H75KGD77", displayName: "JuanaJody56", phone: "61586268400817", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 26, email: "RobanjEltaylg1988@hotmail.com", password: "CNUMGA47IBRFT9", twofa: "CFGHSHQRDTV62FBSWWMCILOOS5HNN5KF", displayName: "MeredithSonja99", phone: "61586569200147", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 27, email: "KirchaeMicjonjonux@hotmail.com", password: "D19XW0NYZ6QJFO", twofa: "XIVQOFSX4MLJDEXNB2QFALBNDKHG7364", displayName: "LeticiaAntonia89", phone: "61586484334462", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 28, email: "PauenrobtRobtonalbf1997@hotmail.com", password: "DGHN6MOKYQR15U", twofa: "IZQWPQPZ6ULXSM3R6F2MMQETKD5LR4F4", displayName: "TanyaMona81", phone: "61586173064710", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 29, email: "EnsonpauqPaumarsonzg@hotmail.com", password: "E4KGMOSC1UPWY8", twofa: "KFOQXJGILJOPQFGE3GR2K367UHV6SSOI", displayName: "JennySandy68", phone: "61586571930157", goLoginStatus: "not-setup" as const },
  { platform: "facebook", index: 30, email: "ChapauenxRobkirmicja1990@hotmail.com", password: "EC87L2PIMSRWHX", twofa: "CYNFMXDLWKBLIU4MO23MRNLWDQLBDQIX", displayName: "MiriamRaquel69", phone: "61586199283017", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 1, email: "LeoneBautistar4c72@clso.us", password: "vfdsxcgh137", twofa: "7ZT76GSQJLPRVYT7W6YIZZ5GS5O3F3QA", profileUrl: "https://www.linkedin.com/in/leone-bautista-2942b53a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 2, email: "SherilynPoulinjheqw@clso.us", password: "bvcfdsgh137", twofa: "IWHOT6EPLLOPJ4QQ7KPPQCGSP7NRRJ2U", profileUrl: "https://www.linkedin.com/in/sherilyn-poulin-88b9973a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 3, email: "AverilDodsontu3mz@clso.us", password: "nbgfcdzx137", twofa: "EY5226NNCIYUCEHR6KB3GR2EWSWH2CHX", profileUrl: "https://www.linkedin.com/in/averil-dodson-9b02ba3a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 4, email: "MichelleHidalgo0ow0h@clso.us", password: "bvgfdsrt137", twofa: "XXYSMSGH36USEPMXXZJRKGEYV2GKSBLT", profileUrl: "https://www.linkedin.com/in/michelle-hidalgo-ba89903a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 5, email: "GinaDoughertyy8nig@clso.us", password: "xcvgfdbh137", twofa: "CC6U5N7SUXXDA6G7EW7KDS5Z576AGHJH", profileUrl: "https://www.linkedin.com/in/gina-dougherty-36b0543a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 6, email: "VioleDiazcrn5o@clso.us", password: "hrtytrgffdj000", twofa: "GYZOZZPGI6FAVQC5C6HV2LNSFVNH4IYN", profileUrl: "https://www.linkedin.com/in/viole-diaz-3960483a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 7, email: "CelinaClearyqyug1@clso.us", password: "hgyjhykyrt000", twofa: "4G2EVRK2TRQJFPRSSJY3Z6D3CC33V2QN", profileUrl: "https://www.linkedin.com/in/celina-cleary-a282b63a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 8, email: "AndeeKellyu2qjm@clso.us", password: "jtylujwqwgl000", twofa: "FEWYUKH6HHYRCXJTONPKTD2KSRDNXVYP", profileUrl: "https://www.linkedin.com/in/andee-kelly-2033033a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 9, email: "EvitaPippindtsew@clso.us", password: "jhjtyuryr000", twofa: "JU6ETVZKWFTAUZHSMPR25WBIOTVIOZBG", profileUrl: "https://www.linkedin.com/in/evita-pippin-69b9963a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 10, email: "HalleyLucaswtsqo@clso.us", password: "trytutyu000", twofa: "OGR27242YCX2IQMLMEFIYSNVBJTSTIKZ", profileUrl: "https://www.linkedin.com/in/halley-lucas-92505b3a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 11, email: "LennaHoovers6cqz@clso.us", password: "ghtryehn000", twofa: "KH4NEQJZO5KXLJXKA2TVAA6IBKA5OM4S", profileUrl: "https://www.linkedin.com/in/lenna-hoover-7332b23a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 12, email: "FelipaClementsrnh3u@clso.us", password: "hgfhtryrgh000", twofa: "3J36VHVU6LZUSA2YKPJSPJHZA6NJQIEV", profileUrl: "https://www.linkedin.com/in/felipa-clements-7070583a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 13, email: "MelliHarrisoneeetd@clso.us", password: "htyrterj000", twofa: "AG2I2HR36EIAYSKUIM2MKAQLIL2AV2NF", profileUrl: "https://www.linkedin.com/in/melli-harrison-6182b73a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 14, email: "NorineCaldwellseuw9@clso.us", password: "jjytthhgh000", twofa: "PS66L5ETETERX5I5RDIYPZB5LTUJ54MN", profileUrl: "https://www.linkedin.com/in/norine-caldwell-4bb3033a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 15, email: "BrandaisMayergj453@clso.us", password: "jtyuttygb000", twofa: "X7EWHTHELICQ2JT7Y4XZXDBUS52A23MC", profileUrl: "https://www.linkedin.com/in/brandais-mayer-56b9923a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 16, email: "CelisseCarriere2697@clso.us", password: "hgtyutyyrt000", twofa: "US2EZ2AGPLUZQWJHR37DF7BZ73XCEVDJ", profileUrl: "https://www.linkedin.com/in/celisse-carrier-6360633a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 17, email: "IleneVerar2ruu@clso.us", password: "fsdttyut000", twofa: "4MFSLUCSGTLRBVYXJJHBQTJF5LGEN2KC", profileUrl: "https://www.linkedin.com/in/ilene-vera-4020453a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 18, email: "EadieRiveraole1r@clso.us", password: "jujtyurt000", twofa: "HZOLKOJYMWNY7JMFGW4NWAFOUJA32I76", profileUrl: "https://www.linkedin.com/in/eadie-rivera-1660643a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 19, email: "KoreFrye2p9ei@clso.us", password: "jkkjjyjhfg000", twofa: "2GCVJLA5U33TMT3GRSNQTQNIY3TZB25C", profileUrl: "https://www.linkedin.com/in/kore-frye-0992ba3a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 20, email: "SibellaHigh8vhcn@clso.us", password: "gjttyutu000", twofa: "IUVSK5CSPW4WFPTMZIPS5VZH6TFPMC5C", profileUrl: "https://www.linkedin.com/in/sibella-high-0943043a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 21, email: "LinnetTapiasoegb@clso.us", password: "gyhdrtyrt000", twofa: "U3JRZHX2SZ76YZFAT75ONUNHO2XCNNEG", profileUrl: "https://www.linkedin.com/in/linnet-tapia-85a05b3a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 22, email: "AdreaCaldwelljleca@clso.us", password: "htuyryer000", twofa: "GQ2ESAN4TPXVYFHRNYOJKMMQZYMMHGE7", profileUrl: "https://www.linkedin.com/in/adrea-caldwell-ba49943a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 23, email: "EmelyneBethea6ce3u@clso.us", password: "jhjertret000", twofa: "NAVPYUY3OM36L6YWPDVZSB6K4PENDS4U", profileUrl: "https://www.linkedin.com/in/emelyne-bethea-76a3033a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 24, email: "RubyYu25gr6@clso.us", password: "yutyutyu000", twofa: "FSISFLKXGHLLA6ISWXPFEGMXVXFDIPBY", profileUrl: "https://www.linkedin.com/in/ruby-yu-9203043a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 25, email: "LucilleWilkinsonwaxlj@clso.us", password: "hgjthrty000", twofa: "AAHLFBLLWWSRHMDL6RYDVFS3NH3IOH7G", profileUrl: "https://www.linkedin.com/in/lucille-wilkinson-9859923a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 26, email: "FlossyPeekywe7d@clso.us", password: "utryrtyer000", twofa: "3XBZFNNTAU5GK3AU2KRL4ZVGAKG4SFJ5", profileUrl: "https://www.linkedin.com/in/flossy-peek-19a0583a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 27, email: "KajaWhiting0yv46@clso.us", password: "fgyttryrtj000", twofa: "MV6XQGR7CYOO6HZ5HGPST66MR3XFHPBC", profileUrl: "https://www.linkedin.com/in/kaja-whiting-b689903a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 28, email: "BebeGillh1zsb@clso.us", password: "jytyuiyufk000", twofa: "NV2FJ4SKHQPJXGWZTSRKPHNFETZCJYG6", profileUrl: "https://www.linkedin.com/in/bebe-gill-32998a3a8/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 29, email: "XyliaHammfv1ip@clso.us", password: "hgfhttyed000", twofa: "PSPLZFXTRZDEWK2ZBIGHHVF6MBNHMAI5", profileUrl: "https://www.linkedin.com/in/xylia-hamm-4a80643a9/", goLoginStatus: "not-setup" as const },
  { platform: "linkedin", index: 30, email: "BellMoody8wsxu@clso.us", password: "jhgjtryrty000", twofa: "5HNQ5BKNJK5HGUS4NYBUENF5FVTUEK7D", profileUrl: "https://www.linkedin.com/in/bell-moody-49b0513a9/", goLoginStatus: "not-setup" as const }
]

export async function GET() {
  try {
    // Fetch live GoLogin profiles (list + individual details for session status)
    let goLoginProfiles: Record<string, GoLoginProfile> = {}
    const token = process.env.GOLOGIN_API_TOKEN
    if (token) {
      try {
        // First get list for basic info
        const res = await fetch("https://api.gologin.com/browser/v2?limit=100", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        })
        if (res.ok) {
          const data = await res.json()
          for (const p of (data.profiles || [])) {
            goLoginProfiles[p.id] = p
          }

          // Fetch individual profiles + cookies in parallel for real login status
          const ids = Object.keys(goLoginProfiles)
          const [details, cookies] = await Promise.all([
            Promise.allSettled(
              ids.map(id =>
                fetch(`https://api.gologin.com/browser/${id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                  cache: "no-store",
                }).then(r => r.ok ? r.json() : null)
              )
            ),
            Promise.allSettled(
              ids.map(id =>
                fetch(`https://api.gologin.com/browser/${id}/cookies`, {
                  headers: { Authorization: `Bearer ${token}` },
                  cache: "no-store",
                }).then(r => r.ok ? r.json() : null)
              )
            ),
          ])

          for (let i = 0; i < ids.length; i++) {
            const detailResult = details[i]
            if (detailResult.status === "fulfilled" && detailResult.value) {
              goLoginProfiles[ids[i]] = { ...goLoginProfiles[ids[i]], ...detailResult.value }
            }
            // Check cookies for actual platform login
            const cookieResult = cookies[i]
            if (cookieResult.status === "fulfilled" && Array.isArray(cookieResult.value)) {
              const cookieList = cookieResult.value as Array<{ name: string; domain: string }>
              const igCookies = cookieList.filter(c => c.domain?.includes("instagram"))
              const fbCookies = cookieList.filter(c => c.domain?.includes("facebook"))
              const liCookies = cookieList.filter(c => c.domain?.includes("linkedin"))
              const hasIgSession = igCookies.some(c => c.name === "sessionid")
              const hasFbSession = fbCookies.some(c => c.name === "c_user")
              const hasLiSession = liCookies.some(c => c.name === "li_at")
              ;(goLoginProfiles[ids[i]] as any)._loggedIn = hasIgSession || hasFbSession || hasLiSession
              ;(goLoginProfiles[ids[i]] as any)._cookieCount = cookieList.length
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch GoLogin profiles:", e)
      }
    }

    // Enrich with GoLogin data
    const enriched = ACCOUNTS.map((acct) => {
      const key = `${acct.platform}_${acct.index}`
      const goLoginId = GOLOGIN_IDS[key]
      if (goLoginId) {
        const profile = goLoginProfiles[goLoginId]
        const proxySession = `session-${acct.platform.slice(0,2)}${String(acct.index).padStart(2,"0")}`
        const base: AccountRecord = {
          ...acct,
          goLoginId,
          goLoginStatus: "ready" as const,
          proxyInfo: `brd.superproxy.io:33335 (${proxySession})`,
        }
        if (profile) {
          base.goLoginProfileName = profile.name
          base.goLoginCanRun = profile.canBeRunning
          base.goLoginRunDisabled = profile.runDisabledReason
          base.goLoginOS = profile.os
          base.goLoginBrowser = profile.browserType
          base.goLoginLastUpdated = profile.updatedAt
          base.goLoginCreated = profile.createdAt
          base.goLoginProxyEnabled = profile.proxyEnabled
          base.goLoginProxyHost = profile.proxy?.host
          base.goLoginStartUrl = profile.startUrl || undefined
          // Use cookie check for real login status, fall back to s3Path for "browser opened"
          base.goLoginHasSession = !!(profile as any)._loggedIn
          base.goLoginUserAgent = profile.navigator?.userAgent
          base.goLoginTags = profile.tags
          base.goLoginLocked = profile.lockEnabled
          base.goLoginNotes = profile.notes
          base.goLoginName = profile.name
        }
        return base
      }
      return acct
    })

    return NextResponse.json({ accounts: enriched, total: enriched.length })
  } catch (error) {
    console.error("Error loading accounts:", error)
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 })
  }
}
