# Custom Domain Maker

A script to create new custom domains based on the `iamalive-stage-region.com` domains.

The goal of this script is to create a new subdomain that can itself have subdomains based on the `iamalive` domains that exist is each of our accounts.

## E.g. custom-domains-reflect-changes-canary

Running the script and providing the name `custom-domains-reflect-changes-canary`:

```bash
> npm run custom-domain-maker

What is the name of your custom domain? custom-domains-reflect-changes-canary

The following domains will be created:
custom-domains-reflect-changes-canary.iamalive-beta.com
custom-domains-reflect-changes-canary.iamalive-gammaiad.com
custom-domains-reflect-changes-canary.iamalive-gammapdx.com
custom-domains-reflect-changes-canary.iamalive-arn.com
custom-domains-reflect-changes-canary.iamalive-bah.com
custom-domains-reflect-changes-canary.iamalive-bom.com
custom-domains-reflect-changes-canary.iamalive-cdg.com
custom-domains-reflect-changes-canary.iamalive-cmh.com
custom-domains-reflect-changes-canary.iamalive-dub.com
custom-domains-reflect-changes-canary.iamalive-fra.com
custom-domains-reflect-changes-canary.iamalive-gru.com
custom-domains-reflect-changes-canary.iamalive-hkg.com
custom-domains-reflect-changes-canary.iamalive-iad.com
custom-domains-reflect-changes-canary.iamalive-icn.com
custom-domains-reflect-changes-canary.iamalive-lhr.com
custom-domains-reflect-changes-canary.iamalive-mxp.com
custom-domains-reflect-changes-canary.iamalive-nrt.com
custom-domains-reflect-changes-canary.iamalive-pdx.com
custom-domains-reflect-changes-canary.iamalive-sfo.com
custom-domains-reflect-changes-canary.iamalive-sin.com
custom-domains-reflect-changes-canary.iamalive-syd.com
custom-domains-reflect-changes-canary.iamalive-yul.com

Please ensure these are correct. This will create a lot of resources across every account.
Continue? (y/n) y

Seriously - make sure this is 100% correct before continuing. There is no script to cleanup mistakes.
Continue? (y/n)
```

## How this works

Each region already contains an `iamalive` Route53 Hosted Zone. This scripts creates a new Hosted Zone for each account based on the provided name. This new Hosted Zone will then be added to the `iamalive` Hosted Zone as a domain capable of having subdomains added to it.

This will allow amplify to create subdomains for branches as need. Our example above would then be able to have `some-feature` branch and result in:

```bash
some-feature.custom-domains-reflect-changes-canary.iamalive-yul.com
```
