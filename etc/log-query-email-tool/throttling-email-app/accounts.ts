export function isServiceAccount(accountToCheck: string) {
    for (const stage of Object.keys(accounts)) {
        for (const region of Object.keys(accounts[stage])) {
            if (accounts[stage][region]['account'] === accountToCheck) {
                return true;
            }
        }
    }
    return false;
}

const accounts: any = {
    "Gamma": {
        "us-east-1": {
            "account": "396176200477"
        }
    },
    "Beta": {
        "us-west-2": {
            "account": "033345365959"
        }
    },
    "PreProd": {
        "eu-north-1": {
            "account": "241572322679"
        },
        "me-south-1": {
            "account": "905484389639"
        },
        "ap-south-1": {
            "account": "414549345730"
        },
        "us-east-2": {
            "account": "795328988917"
        },
        "ap-northeast-1": {
            "account": "521901182269"
        },
        "eu-west-1": {
            "account": "261067636671"
        },
        "eu-central-1": {
            "account": "645662906121"
        },
        "sa-east-1": {
            "account": "250849867218"
        },
        "ap-east-1": {
            "account": "014224714919"
        },
        "us-east-1": {
            "account": "373263430287"
        },
        "ap-northeast-2": {
            "account": "664363737505"
        },
        "eu-west-2": {
            "account": "217549701435"
        },
        "eu-south-1": {
            "account": "105889380570"
        },
        "us-west-2": {
            "account": "808545654877"
        },
        "us-west-1": {
            "account": "652616700988"
        },
        "ap-southeast-1": {
            "account": "869518299611"
        },
        "ap-southeast-2": {
            "account": "606839312539"
        },
        "ca-central-1": {
            "account": "968464305406"
        },
        "eu-west-3": {
            "account": "130362053750"
        }
    },
    "Prod": {
        "eu-north-1": {
            "account": "315276288780"
        },
        "me-south-1": {
            "account": "183380703454"
        },
        "ap-south-1": {
            "account": "801187164913"
        },
        "us-east-2": {
            "account": "264748200621"
        },
        "ap-northeast-1": {
            "account": "550167628141"
        },
        "eu-west-1": {
            "account": "565036926641"
        },
        "eu-central-1": {
            "account": "644397351177"
        },
        "sa-east-1": {
            "account": "068675532419"
        },
        "ap-east-1": {
            "account": "574285171994"
        },
        "us-east-1": {
            "account": "073653171576"
        },
        "ap-northeast-2": {
            "account": "024873182396"
        },
        "eu-west-2": {
            "account": "499901155257"
        },
        "eu-south-1": {
            "account": "804516649577"
        },
        "us-west-2": {
            "account": "395333095307"
        },
        "us-west-1": {
            "account": "214290359175"
        },
        "ap-southeast-1": {
            "account": "148414518837"
        },
        "ap-southeast-2": {
            "account": "711974673587"
        },
        "ca-central-1": {
            "account": "824930503114"
        },
        "eu-west-3": {
            "account": "693207358157"
        }
    }
}