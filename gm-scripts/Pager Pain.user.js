// ==UserScript==
// @name         Pager Pain
// @namespace    http://aws.amazon.com/
// @version      2.05
// @description  Generate wiki notes for pages with emojis.  Assumes your oncall runs 9am-9am Monday-Monday.
// @author       behroozi@
// @include      https://paging.corp.a2z.com/
// @require      https://cdnjs.cloudflare.com/ajax/libs/dayjs/1.9.4/dayjs.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @updateURL    https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/gm-scripts/Pager%20Pain.user.js?download=1
// @downloadURL  https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/gm-scripts/Pager%20Pain.user.js?download=1
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @icon         data:image/png;base64,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
// ==/UserScript==

(function() {
    'use strict';

    let bodyList = document.getElementById("root");
    const HEADER_ID = 'app-header';
    const BUTTON_GROUP_PARENT_CLASS = '.awsui_utilities_k5dlb_17bgp_225';
    const BUTTON_TEXT_SELECTOR = 'span a span';
    const ROW_SELECTOR = 'tbody tr';
    const SUBJECT_SELECTOR = ':nth-child(2) a';
    const SOURCE_SELECTOR = ':nth-child(3)';
    const TIMESTAMP_SELECTOR = ':nth-child(4)';
    let observer = new MutationObserver(function(mutations, o) {
        if(document.getElementById(HEADER_ID)){
            //when the .send-buttons class shows up
            //clone a button, call it Pain and attach the click action to it
            let buttons = $(BUTTON_GROUP_PARENT_CLASS);
            if(buttons.length !== 0 && buttons.children().length > 2) {
                let clone = buttons.children().first().clone();
                clone.click(function(e){
                    if(!/#\/pages$/.test(window.location.href)){
                       window.location.href = "https://paging.corp.a2z.com/#/pages";
                       GM_notification({title:"Action Required",
                                         text: "Click 😡 Pain again",
                                         timeout: 3000,
                                         image:GM_info.script.icon}, null);
                       return;
                    }
                    try {
                        //get any existing pages associated with the pain button
                        //so new pages can be overlayed
                        let data = $(this).data('pages') || {};
                        //for each page
                        $(ROW_SELECTOR).each(function(){
                            //screen scrape content to turn it into objects
                            let page = $(this).find(SUBJECT_SELECTOR);
                            let link = page.attr('href');
                            let subject = page.text();
                            let source = $(this).find(SOURCE_SELECTOR).text();

                            //remove GMT from timestamp so it can be parsed with day.js
                            let timestamp = $(this).find(TIMESTAMP_SELECTOR).text().replace(' GMT','').trim();

                            //remove the Escalated/New Sev 2 from details
                            let details = {subject:subject.replace(/^.*Sev\d(.\d)? - /,""),source:source,timestamp:timestamp};
                            let ttRegex = subject.match(/(?:SIM|Ticket \#|TT) (\w+)/);
                            if(ttRegex) {
                                details.ticket_id = ttRegex[1];
                            }
                            data[link] = details;
                        });

                        //store this page of data against the page pain button so we can keep appending new content to it
                        $(this).data('pages',data);

                        //reverse sort the pages
                        let pages = Object.values(data).sort((e1,e2)=>e2.timestamp.localeCompare(e1.timestamp));

                        //filter out pages that weren't in last week
                        let lastWeekPages = lastWeekFilter(pages);
                        let summary = pageSummary(lastWeekPages);
                        logJSONPretty(summary);
                        GM_setClipboard(toWiki(summary));
                        let completed = lastWeekPages.length!=pages.length;
                        GM_notification({title:`${completed?"Wiki Content":"Action Required"}`,
                                         text: `${completed?"Copied!":"Go to next page and click 😡 Pain again"}`,
                                         timeout: 3000,
                                         image:GM_info.script.icon}, null);
                    }catch(err) {
                        console.log(err);
                    }
                    return false;
                });
                clone.find(BUTTON_TEXT_SELECTOR).text('😡 Pain');
                buttons.prepend(clone);
                o.disconnect();
            }
        }
    });
    observer.observe(bodyList, {childList:true, subtree:true});


    let sourceLookup = {"issues" : "https://t.corp.amazon.com/",
                        "remedy" : "https://tt.amazon.com/"};

    let DAY_TIME_PAIN = "🙁";

    let painLookup = [
        {emoji: "😳", after:6*3600, before:9*3600},
        {emoji: "😳", after:17*3600, before:23*3600},
        {emoji: "😡", after:23*3600, before:24*3600},
        {emoji: "😡", after:0, before:6*3600}
    ];

    function nullSafe(map){
        return map || {};
    }

    function isAfterHours(emoji) {
        return emoji != DAY_TIME_PAIN;
    }

    //turn a date into a emoji
    function getEmoji(date) {
        let dayJsDate = dayjs(date);
        let seconds = dayJsDate.hour()*3600 + dayJsDate.minute()*60 + dayJsDate.second();
        for(let entry of painLookup){
            if(seconds >= entry.after && seconds < entry.before){
                return entry.emoji;
            }
        }
        return DAY_TIME_PAIN;
    }

    //filter for pages since last week at 9 am.
    function lastWeekFilter(response){
        let lastMonday = dayjs().startOf('week').subtract(1,"week");
        lastMonday.set({hour:9,minute:0,hour:0,second:0,millisecond:0});
        return response.filter(page => {
            const pageDate = dayjs(page.timestamp);
            return !lastMonday.isAfter(pageDate);
        });
    }

    //build a link for a page
    function getURL(page){
        return sourceLookup[page.source]? sourceLookup[page.source] + page.ticket_id : `mailto:${page.source}`;
    }

    function getSource(page){
        return page.ticket_id || page.source;
    }

    function logJSONPretty(json){
        console.log(JSON.stringify(json , null, 4));
    }

    function incrementPageCount(name, map, increment) {
        increment = increment || 1;
        let key = `${name} Pages`;
        let count = map[key];
        count = count ? count + increment : increment;
        map[key] = count;
    }

    function pageSummary(pages){
        let result = {};
        for(let page of pages.reverse()){
            let id = page.ticket_id || page.timestamp;
            let entry = result[id] || {pages:0, timestamps:[]};
            let emoji = getEmoji(page.timestamp);
            entry.pages = entry.pages + 1;
            entry.url = getURL(page);
            entry.source = getSource(page);
            entry.subject = page.subject.replace(/^.*Subject:/,"");
            entry.timestamps.push({utc:dayjs(page.timestamp).toISOString(),local:dayjs(page.timestamp).format('YYYY-MM-DD h:mm A'), emoji:emoji});
            result[id] = entry;
        }
        return result;
    }

    function toWiki(pageSummary){
        var content = "(% border=\"1\" %)\n|=#|=Link|=Subject|=Timestamps";
        var number = 1;
        var pageCounts = {};
        for(let entry of Object.keys(pageSummary)){
            entry = pageSummary[entry];
            content +=`\n|${number}`;
            if(entry.pages > 1) {
                content += `-${number+entry.pages-1}`;
            }
            incrementPageCount('Total', pageCounts, entry.pages);
            number += entry.pages;
            content += `|[[${entry.source}>>${entry.url}]]|\{\{\{${entry.subject}\}\}\}|(% style="white-space:pre" %)`;
            for(const page of entry.timestamps){
                content += `${page.emoji} ${page.local}\\\\`;
                if(isAfterHours(page.emoji)){
                    incrementPageCount('After Hours', pageCounts);
                }
                incrementPageCount(page.emoji, pageCounts);
            }
        }
        incrementPageCount('Unique', pageCounts, Object.keys(pageSummary).length);

        //Sort counts so it is total pages, after hours pages, emoji pages
        for(let type of Object.keys(pageCounts).sort().reverse()){
            content += `\n|(% colspan="4" %)**${type}**: ${pageCounts[type]}`
        }
        return content;
    }
})();