// ==UserScript==
// @name         Pipelines Deploy Counter
// @description  Add button to count deploys for teams
// @namespace    https://code.amazon.com/packages/AWSAmplifyTools/
// @version      0.2
// @author       anatonie@
// @match        https://pipelines.amazon.com
// @run-at       document-end
// @require      https://code.jquery.com/jquery-3.2.1.min.js
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @downloadURL  https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/gm-scripts/pipelinesDeployCounter.js?raw=1
// ==/UserScript==

'use strict';

(function () {
  /*
   * deploys {
   *     teamName {
   *         pipelineCount
   *         deploys
   *         completeCount
   *         failCount
   */
  const deploys = new Proxy({}, {
    set: function (target, key, value) {
      target[key] = value;
      updateElements();
      return true;
    }
  });
  function intializeWatchedElement(teamName, initialValue) {
    deploys[teamName] = new Proxy(initialValue, {
      set: function (target, key, value) {
        target[key] = value;
        updateElements();
        return true;
      }
    });
  }
  function updateElements() {
    $("#pipelines_by_teams").children('ul').children('li').each(function() {
      const teamName = $($(this).children()[0]).children()[0].innerText;
      if (deploys[teamName]) {
        const infoElement = $(this).find('.info')[0];
        if (deploys[teamName].pipelineCount > deploys[teamName].completeCount) {
          infoElement.innerText = 'In progress ' + deploys[teamName].completeCount + '/' + deploys[teamName].pipelineCount;
        } else {
          infoElement.innerText = 'Deploys: ' + deploys[teamName].deploys;
        }
      }
    });
  }
  function addButtons() {
    $("#pipelines_by_teams").children('ul').children('li').each(function() {
      const button = document.createElement('button');
      const teamName = $(this).children()[0].innerText;
      const getCountsFunc = function() {
        getDeployCounts(teamName);
      };
      button.innerText = 'Check deploys for last week';
      button.onclick = getCountsFunc;
      $($(this).children('h2')[0]).append(button);
      const infoElement = document.createElement('span');
      infoElement.classList.add('info');
      infoElement.setAttribute('style', 'margin-left:6rem');
      $($(this).children('h2')[0]).append(infoElement);
    });
  }
  function toDateString(date) {
    // 2019-04-15
    function getMonth(date) {
      const month = date.getMonth() + 1;
      return month > 9 ? month : '0' + month;
    }
    function getDate(date) {
      const day = date.getDate();
      return day > 9 ? day : '0' + day;
    }
    return date.getFullYear() + '-' + getMonth(date) + '-' + getDate(date);
  }
  function getDeployCounts(team) {
    let pipelinesComplete = 0;
    let pipelineCount = 0;
    const req = typeof (GM_xmlhttpRequest) == "function" ? GM_xmlhttpRequest : GM.xmlHttpRequest;
    $.each($("#pipelines_by_teams").children('ul').children('li'), (_, item) => {
      const teamName = $($(item).children()[0]).children()[0].innerText;
      if (teamName === team) {
        pipelineCount = $(item).children('table').find("tr").length;
        intializeWatchedElement(teamName, {
          pipelineCount: pipelineCount,
          deploys: 0,
          completeCount: 0,
          failCount: 0
        });
        $(item).children('table').find("tr").each(function () {
          let deployCount = 0;
          const pipelineElement = $(this);
          const href = $(this).find('td.name a').attr('href');
          // dateDiff = 1,000 ms * 60 s * 60 mins * 24 hrs * 7 days;
          const dateDiff = 1000 * 60 * 60 * 24 * 7;
          const currentDate = new Date();
          const oldDate = new Date(currentDate.getTime() - dateDiff);
          req({
            url: 'https://pipelines.amazon.com' + href + '/statistics?from=' + toDateString(oldDate) + '&to=' + toDateString(currentDate) + '&offset=',
            method: 'GET',
            onload: (response) => {
              try {
                const dom = $.parseHTML(response.responseText, document, true);
                $(dom).find('div.pipeline .stages').children('li.stage').each(function() {
                  const prodBanner = $(this).find('.prod-banner');
                  if (prodBanner.length >= 1) {
                    $(this).find('.stage_info table tr').first().find('td.value').each(function() {
                      deployCount += parseInt(this.innerText);
                    });
                  }
                });
                const newElement = document.createElement('div');
                newElement.innerText = deployCount === 0 ? '-' : deployCount;
                $(pipelineElement).append(newElement);
                deploys[teamName].deploys += deployCount;
              } catch (e) {
                deploys[teamName].failCount++;
              }
              deploys[teamName].completeCount++;
            }
          });
        });
      }
    });
  }
  addButtons();
})();
