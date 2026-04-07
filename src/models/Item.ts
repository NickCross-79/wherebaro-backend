export default class Item {
    constructor(
        public name: string,
        public wikiImageLink: string,
        public cdnImageLink: string,
        public link: string,
        public creditPrice: number, 
        public ducatPrice: number,
        public type: string, 
        public offeringDates: string[],
        public likes: string[],
        public reviews: string[],
        public uniqueName?: string,
        public wishlistPushTokens?: string[],
        public wishlistCount: number = 0,
        public buy: string[] = [],
        public skip: string[] = []
    ) {}
}