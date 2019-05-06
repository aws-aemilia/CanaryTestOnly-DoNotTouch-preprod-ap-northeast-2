// ==UserScript==
// @name         Isengard helper
// @description  Add highlighting and regions to isengard rows
// @namespace    https://code.amazon.com/packages/AWSAmplifyTools/
// @version      0.1
// @author       anatonie@
// @run-at       document-end
// @match        https://isengard.amazon.com/console-access
// @downloadURL  https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/gm-scripts/isengardHelper.js?raw=1
// ==/UserScript==

(function() {
  'use strict';
  addAccountRowHoverState();
  waitForAccounts();
})();
function addAccountRowHoverState() {
  const hoverStyles = '.account-entry:hover {background-color: #e3ecf9;cursor: pointer;}';
  const style = document.createElement('style');
  if (style.styleSheet) {
    style.styleSheet.cssText = hoverStyles;
  } else {
    style.appendChild(document.createTextNode(hoverStyles));
  }
  document.getElementsByTagName('head')[0].appendChild(style);
}
function waitForAccounts(waitCount = 0) {
  const accounts = document.getElementsByClassName('account-entry');
  if (accounts.length <= 0) {
    if (waitCount < 10) {
      waitCount++;
      return setTimeout(waitForAccounts.bind(null, waitCount), 1000);
    }
  }
  processAccounts();
}
function processAccounts() {
  // mapping from: https://w.amazon.com/bin/view/Paulbaye/AWS_Region_name_to_Three-Letter-Acronym_to_Long_Name_Mapping/
  const regionMap = {
    iad: {
      selector: 'Northern Virginia',
      region: 'us-east-1'
    },
    sfo: {
      selector: 'Northern California',
      region: 'us-west-1'
    },
    pdx: {
      selector: 'Oregon',
      region: 'us-west-2'
    },
    cmh: {
      selector: 'Columbus, Ohio',
      region: 'us-east-2'
    },
    yul: {
      selector: 'Montreal Quebec Canada',
      region: 'ca-central-1'
    },
    bom: {
      selector: 'Mumbai, India',
      region: 'ap-south-1'
    },
    icn: {
      selector: 'Seoul, South Korea',
      region: 'ap-northeast-2'
    },
    sin: {
      selector: 'Singapore',
      region: 'ap-southeast-1'
    },
    syd: {
      selector: 'Sydney, Austrailia',
      region: 'ap-southeast-2'
    },
    nrt: {
      selector: 'Tokyo, Japan',
      region: 'ap-northeast-1'
    },
    fra: {
      selector: 'Frankfurt, Germany',
      region: 'eu-central-1'
    },
    dub: {
      selector: 'Dublin, Ireland',
      region: 'eu-west-1'
    },
    lhr: {
      selector: 'London, England',
      region: 'eu-west-2',
    },
    gru: {
      selector: 'Sao Paulo, Brazil',
      region: 'sa-east-1'
    },
    bjs: {
      selector: 'Beijing, China',
      region: 'cn-north-1'
    },
    zhy: {
      selector: 'Zhongwei, Ningxia, China',
      region: 'cn-northwest-1'
    },
    pdt: {
      selector: 'GovCloud',
      region: 'govcloud'
    },
    arn: {
      selector: 'Sweden',
      region: 'eu-north-1'
    },
    hkg: {
      selector: 'Hong Kong',
      region: 'ap-east-1'
    },
    cdg: {
      selector: 'Paris, France',
      region: 'eu-west-3'
    },
    kix: {
      selector: 'Japan',
      region: 'ap-northeast-3'
    }
  };
  const airportCodes = Object.keys(regionMap);
  const accountEntries = document.getElementsByClassName('account-entry');
  for (let i = 0; i < accountEntries.length; i++) {
    const entry = accountEntries[i];
    const email = entry.getElementsByClassName('account-email')[0].innerText.toLowerCase();
    let airportCode = undefined;
    const regionCodeFound = airportCodes.some((code) => {
      const found = email.indexOf(code) > -1;
      if (found) {
        airportCode = code;
      };
      return found;
    });
    if (airportCode) {
      const newElement = document.createElement('div');
      newElement.setAttribute('style', 'color:#888;text-align:left;width: 15%;display: flex;flex-direction: row;flex-wrap: wrap;');
      newElement.innerText = regionMap[airportCode].region;
      // Add the location name
      newElement.innerText += '\n' + regionMap[airportCode].selector;
      const accountInfo = entry.getElementsByClassName('small-account-entry')[0];
      accountInfo.children[0].setAttribute('style', 'width:40%');
      accountInfo.children[1].setAttribute('style', 'width:45%');
      accountInfo.children[0].after(newElement);
    }
  };
}
