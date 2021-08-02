// ==UserScript==
// @name         MCM Changelist
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Looks for amplify and aemilia related changed packages in a pipeline diff and generates markdown suitable for pasting into a CM
// @author       behroozi@
// @include      /https:\/\/pipelines.amazon.com\/.*?(target_events|diff|track_changes_v2|approval_attempts|unapproved_changes)/
// @require      https://godmode.behroozi.people.aws.dev/scripts/jquery.min.js
// @icon         https://godmode.behroozi.people.aws.dev/img/godMode.png
// @grant GM_setClipboard
// @grant GM_notification
// ==/UserScript==

(function() {
    'use strict';
    let a = $("<a/>",{class:"button", title:"Copy changes to clipboard", text: "Copy changes"});
    a.append($("<img/>",{src:`${GM_info.script.icon}`,height:"24"}));
    $(".filter_changes").prepend(a);
    a.click(function() {
        copy();
    });
    function copy() {
        let changes = [];
        let clipboard = `|Author|Change|CR|
| --- |----------------- |-|`;
        $("div.change_info[data-pipeline-specific='true'], div.change_info:not([data-pipeline-specific]) div.commit_info").each(function(index) {
            let change = {};
            change.package = $(this).attr("data-target");
            if(/amplify|aemilia/.test(change.package.toLowerCase())) {
                change.author = $(this).find("span.author > a").text();
                change.time = new Date(Number($(this).find("span.relative-time").attr('data-millis'))).toLocaleString().replace(",","");
                change.change = $(this).find("span.change-link a").attr("href");
                let more = $(this).find("p.description");
                if(more.text().endsWith(" more")) {
                    $(more).find("a")[0].click();
                }
                change.description = more.text();
                let matches = change.description.match(/\n\ncr: (.*)$/m);
                if(matches) {
                    change.description = change.description.replace(matches[0],"");
                    change.cr = { link: matches[1],
                                 name: matches[1].replace(/.*\//,"")
                                }
                }
                changes.push(change);
                clipboard += `\n|[${change.author}](https://phonetool.amazon.com/user/${change.author})|[${change.package} ${change.time}](${change.change}) ${change.description.replaceAll(/\n/g," ")}|${change.cr?"["+change.cr.name+"]("+change.cr.link+")":""}|`;
            }
        });
        if(changes.length > 0) {
            GM_setClipboard(clipboard);
            GM_notification({text: 'Changes Copied!', title: 'MCM Changes', timeout: 2000, image:GM_info.script.icon}, null);
        } else {
            GM_notification({text: 'No Amplify changes found', title: 'Error', timeout: 2000, image:GM_info.script.icon}, null);
        }
    }
})();