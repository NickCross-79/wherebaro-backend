import { ObjectId } from "mongodb";

export default class BaroItem {
    constructor(
        public name: string, 
        public uniqueName: string,
        public image: string,
        public link: string,
        public creditPrice: number, 
        public ducatPrice: number,
        public type: string, 
        public offeringDates: string[],
        public likes: number,
        public reviews: string[],
        public id?: ObjectId
    ) {}
}