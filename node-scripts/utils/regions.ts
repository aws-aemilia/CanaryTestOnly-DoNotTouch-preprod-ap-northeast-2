/**
 * Fragment of the RIP Regions JSON file
 */
import {AirportCode, RegionName} from "../Isengard/types";

const regions: Record<string, {
    "airportCode": string,
    "partition": string,
    "region": string,
}> = {
    "us-isof-south-1": {
        "airportCode": "ALE",
        "partition": "aws-iso-f",
        "region": "us-isof-south-1",
    },
    "us-iso-west-1": {
        "airportCode": "APA",
        "partition": "aws-iso",
        "region": "us-iso-west-1",
    },
    "eu-north-1": {
        "airportCode": "ARN",
        "partition": "aws",
        "region": "eu-north-1",
    },
    "me-south-1": {
        "airportCode": "BAH",
        "partition": "aws",
        "region": "me-south-1",
    },
    "cn-north-1": {
        "airportCode": "BJS",
        "partition": "aws-cn",
        "region": "cn-north-1",
    },
    "ap-south-1": {
        "airportCode": "BOM",
        "partition": "aws",
        "region": "ap-south-1",
    },
    "eu-west-3": {
        "airportCode": "CDG",
        "partition": "aws",
        "region": "eu-west-3",
    },
    "ap-southeast-3": {
        "airportCode": "CGK",
        "partition": "aws",
        "region": "ap-southeast-3",
    },
    "us-east-2": {
        "airportCode": "CMH",
        "partition": "aws",
        "region": "us-east-2",
    },
    "af-south-1": {
        "airportCode": "CPT",
        "partition": "aws",
        "region": "af-south-1",
    },
    "us-iso-east-1": {
        "airportCode": "DCA",
        "partition": "aws-iso",
        "region": "us-iso-east-1",
    },
    "eu-west-1": {
        "airportCode": "DUB",
        "partition": "aws",
        "region": "eu-west-1",
    },
    "me-central-1": {
        "airportCode": "DXB",
        "partition": "aws",
        "region": "me-central-1",
    },
    "eu-central-1": {
        "airportCode": "FRA",
        "partition": "aws",
        "region": "eu-central-1",
    },
    "sa-east-1": {
        "airportCode": "GRU",
        "partition": "aws",
        "region": "sa-east-1",
    },
    "ap-east-1": {
        "airportCode": "HKG",
        "partition": "aws",
        "region": "ap-east-1",
    },
    "ap-south-2": {
        "airportCode": "HYD",
        "partition": "aws",
        "region": "ap-south-2",
    },
    "us-east-1": {
        "airportCode": "IAD",
        "partition": "aws",
        "region": "us-east-1",
    },
    "ap-northeast-2": {
        "airportCode": "ICN",
        "partition": "aws",
        "region": "ap-northeast-2",
    },
    "ap-northeast-3": {
        "airportCode": "KIX",
        "partition": "aws",
        "region": "ap-northeast-3",
    },
    "us-isob-east-1": {
        "airportCode": "LCK",
        "partition": "aws-iso-b",
        "region": "us-isob-east-1",
    },
    "eu-west-2": {
        "airportCode": "LHR",
        "partition": "aws",
        "region": "eu-west-2",
    },
    "us-isof-east-1": {
        "airportCode": "LTW",
        "partition": "aws-iso-f",
        "region": "us-isof-east-1",
    },
    "ap-southeast-4": {
        "airportCode": "MEL",
        "partition": "aws",
        "region": "ap-southeast-4",
    },
    "eu-south-1": {
        "airportCode": "MXP",
        "partition": "aws",
        "region": "eu-south-1",
    },
    "ap-northeast-1": {
        "airportCode": "NRT",
        "partition": "aws",
        "region": "ap-northeast-1",
    },
    "us-gov-east-1": {
        "airportCode": "OSU",
        "partition": "aws-us-gov",
        "region": "us-gov-east-1",
    },
    "us-gov-west-1": {
        "airportCode": "PDT",
        "partition": "aws-us-gov",
        "region": "us-gov-west-1",
    },
    "us-west-2": {
        "airportCode": "PDX",
        "partition": "aws",
        "region": "us-west-2",
    },
    "us-west-1": {
        "airportCode": "SFO",
        "partition": "aws",
        "region": "us-west-1",
    },
    "ap-southeast-1": {
        "airportCode": "SIN",
        "partition": "aws",
        "region": "ap-southeast-1",
    },
    "ap-southeast-2": {
        "airportCode": "SYD",
        "partition": "aws",
        "region": "ap-southeast-2",
    },
    "me-west-1": {
        "airportCode": "TLV",
        "partition": "aws",
        "region": "me-west-1",
    },
    "ca-central-1": {
        "airportCode": "YUL",
        "partition": "aws",
        "region": "ca-central-1",
    },
    "eu-south-2": {
        "airportCode": "ZAZ",
        "partition": "aws",
        "region": "eu-south-2",
    },
    "cn-northwest-1": {
        "airportCode": "ZHY",
        "partition": "aws-cn",
        "region": "cn-northwest-1",
    },
    "eu-central-2": {
        "airportCode": "ZRH",
        "partition": "aws",
        "region": "eu-central-2",
    }
}


const optInRegions = [
    "ap-south-2",
    "af-south-1",
    "eu-south-1",
    "eu-south-2",
    "us-catalyst-1",
    "me-south-1",
    "me-central-1",
    "il-central-1",
    "ap-east-1",
    "ca-west-1",
    "mx-central-1",
    "ap-southeast-3",
    "ap-southeast-4",
    "eu-central-2",
    "ap-southeast-5",
    "in-amazon-1",
]

export const toAirportCode = (region: string): AirportCode => {
    if (Object.values(regions).find(r => r.airportCode === region.toUpperCase())){
        // it is already an airport code, just return it.
        return region.toUpperCase() as AirportCode;
    }

    const lowerCaseRegion = region.toLowerCase();
    if (regions[lowerCaseRegion]) {
        return regions[lowerCaseRegion].airportCode as AirportCode;
    }
    throw new Error(`Not a valid region: ${region}`)
}

export const toRegionName = (region: string): RegionName => {
    if (regions[region.toLowerCase()]) {
        // it is already a region name
        return region.toLowerCase() as RegionName;
    }
    const upperCaseAirportCode = region.toUpperCase();

    const match = Object.values(regions)
        .find((value) => value.airportCode === upperCaseAirportCode);

    if (match) {
        return match.region as RegionName;
    }
    throw new Error(`Not a valid airport code: ${region}`)
}

export const isOptInRegion = (region: string) => {
    return optInRegions.includes(toRegionName(region));
}
