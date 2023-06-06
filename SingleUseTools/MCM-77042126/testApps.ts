// These are test Compute apps that were created by the Hosting Gateway
// integration tests. We'll use them on this MCM to test the new ALBs.

const testApps: {
  [stage: string]: {
    [region: string]: string;
  };
} = {
  gamma: {
    "us-east-1": "dc6hplzpx9ibl",
    "us-west-2": "d1u4gx07d0ayr",
    "eu-north-1": "d3bs4llzlowjyi",
    "me-south-1": "d1gprua24y8nj9",
    "ap-south-1": "d2wkp1idwjnqd2",
    "eu-west-3": "d3ns1b2bumw8cp",
    "us-east-2": "d343ulotd6z455",
    "eu-west-1": "d3d0ld4cnnfydg",
    "eu-central-1": "d2d67f3ucltga3",
    "sa-east-1": "d1oo2rndeda0jw",
    "ap-east-1": "d1ygz8vmzr7ky4",
    "ap-northeast-2": "d2gv191fn3yw84",
    "eu-west-2": "d2b55w4p1ua3ig",
    "eu-south-1": "d1qnkmh1sa8s9o",
    "ap-northeast-1": "d30s8syuwfaw27",
    "us-west-1": "d1thf4v1sb257l",
    "ap-southeast-1": "d11xisr3d789q7",
    "ap-southeast-2": "d1nw2dvqh56jts",
    "ca-central-1": "d2nqr60sdnx6o4",
  },
  prod: {
    "me-south-1": "d55rr4ocwaemj",
    "ap-south-1": "dgnvz0sct71wf",
    "us-east-2": "dhwerd4wsspiw",
    "eu-west-1": "d1uypbf5742l7p",
    "eu-central-1": "d2ptuvmqzmzb9f",
    "ap-east-1": "demu503h3q61y",
    "us-east-1": "d1ots05y49orps",
    "ap-northeast-2": "d271ocb7mldklp",
    "eu-west-2": "doq5o6y6ie49e",
    "eu-south-1": "d2b9nft7akr9kw",
    "ap-northeast-1": "d1ws6xjundhc4i",
    "us-west-2": "d2la7ntphilbds",
    "ap-southeast-1": "d2ln6w0r6emxja",
    "ap-southeast-2": "dvso4965718fy",
    "eu-north-1": "d2vtoc26m31u8o",
    "eu-west-3": "d1ek273ywuzi42",
    "sa-east-1": "d2gm7f5sbrro7k",
    "us-west-1": "d3hwsfn28cj93h",
    "ca-central-1": "dpl3fukotpdtk",
  },
};

export default testApps;
