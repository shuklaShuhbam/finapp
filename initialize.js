(function (window) {
    'use strict';

    if (window.fastlink) {
        console.warn('Yodlee FastLink script is being added more than once. Please make sure to remove the other FastLink script\'s references in page');
        return;
    }

    var opts = {};
    var parentElementId;
    var appId;
    var newWindow;
    var forceIframe = false;
    var forceRedirect = false;

    var getScriptVersion = function (filename) {
        var scriptElements = document.getElementsByTagName('script');
        for (var i = 0; i < scriptElements.length; i++) {
            var source = scriptElements[i].src;
            if (source.indexOf(filename) > -1) {
                var fragments = source.split('/');
                var len = fragments.length;
                if (len >= 2) {
                    return fragments[fragments.length - 2];
                }
                return false;
            }
        }
        return false;
    };

    var isMobileBrowser = function () {
        var isMobile = false;

        if (navigator.userAgent.match(/Android/i)
            || navigator.userAgent.match(/iPhone/i)
            || navigator.userAgent.match(/iPad/i)
            || navigator.userAgent.match(/iPod/i)
            || navigator.userAgent.match(/Windows Phone/i)
        ) {
            isMobile = true;
        } else if (/iP(hone|od|ad)/.test(navigator.platform)) {
            isMobile = true;
        } else if (window.innerWidth <= 800 && window.innerHeight <= 600) {
            isMobile = true;
        }
        return isMobile;
    };

    var version = getScriptVersion('initialize');
    var mobileBrowser = isMobileBrowser();


    /**
     *
     * @param options
     * @private
     */
    var _open = function (options, element) {

        if (_isFLOpen()) {
            if (mobileBrowser) newWindow.focus();
            //TODO: check the format of error object
            options.onError({
                message: 'FastLink already in use, multiple instances of fastLink may not work as expected.'
            });
            return false;
        }
        opts = options;
        appId = opts.app || 'fastlink';
        forceIframe = opts.forceIframe || false;
        forceRedirect = opts.forceRedirect || false;
        mobileBrowser = mobileBrowser && !forceIframe;

        if (!opts.fastLinkURL) {
            throw new Error('FastLink App URL not found');
        }
        if (!opts.jwtToken && !opts.samlToken && !opts.accessToken) {
            throw new Error('Valid JWT or SAML or access Token not found');
        } else if ((opts.jwtToken && opts.samlToken) || (opts.jwtToken && opts.accessToken) || (opts.samlToken && opts.accessToken) || (opts.jwtToken && opts.samlToken && opts.accessToken)) {
            throw new Error('Please provide only one valid Token');
        } else if (opts.jwtToken) {
            opts.jwtToken = opts.jwtToken.trim();
            if (opts.jwtToken.indexOf('Bearer') > 0) {
                throw new Error('Please provide valid JWT Token');
            } else if (opts.jwtToken.indexOf('Bearer') == -1) {
                opts.jwtToken = 'Bearer ' + opts.jwtToken;
            }
        } else if (opts.accessToken) {
            opts.accessToken = opts.accessToken.trim();
            if (opts.accessToken.indexOf('Bearer') > 0) {
                throw new Error('Please provide valid access Token');
            } else if (opts.accessToken.indexOf('Bearer') == -1) {
                opts.accessToken = 'Bearer ' + opts.accessToken;
            }
        }
        if (opts.params != null && typeof opts.params == 'string') {
            opts.params = _htmlDecode(opts.params);
            try {
                opts.params = JSON.parse(opts.params);
            } catch (e) {
                //params are of type string
            }
        }
        if (!opts.params && !opts.params.configName) {
            throw new Error('FastLink Params configName not found');
        }

        parentElementId = element;
        var parentElem = document.getElementById(parentElementId);

        if (!element || !parentElem) {
            throw new Error('Invalid container element');
        }

        var iframe = null;
        if (!mobileBrowser) {
            iframe = _createIFrame(parentElem, opts);
        }
        var FLForm = _createForm(opts, iframe);
        FLForm.submitForm();
        if (window.addEventListener) {
            window.addEventListener('message', _listenToPostMessageFromFL, false);
        } else {
            window.attachEvent('onmessage', _listenToPostMessageFromFL);
        }
        opts.fastLinkOpened = true;
    };
    /**
     *
     * @private
     */
    var _close = function () {
        if (mobileBrowser && newWindow) {
            newWindow.close();
        } else if (!mobileBrowser) {
            var parentElem = document.getElementById(parentElementId);
            if (parentElem && parentElem.hasChildNodes()) {
                parentElem.removeChild(opts.fastLinkDom);
            }
        }
        opts.fastLinkOpened = false;
    };

    /**
     *
     * @param event
     */
    var _listenToPostMessageFromFL = function (event) {

        if (mobileBrowser) {
            if (opts.fastLinkURL && opts.fastLinkURL.indexOf(event.origin) == 0) {
                _parsePostMessage(event);
            }
        } else {
            if (opts.fastLinkURL && opts.fastLinkURL.indexOf(event.origin) == 0) { //e.g. event.origin => https://node.sandbox.yodlee.com
                var iframes = document.getElementsByTagName('iframe');
                for (var i = 0; i < iframes.length; i++) {
                    if (event.source === iframes[i].contentWindow) {
                        _parsePostMessage(event);
                        break;
                    }
                }
            }
        }
    };

    var _parsePostMessage = function () {
        var data = event.data;
        var frame = document.getElementById('fl-frame');


        if (!data) {
            return;
        }
        if (data.fnToCall === 'resizeIframeWindow') {

            if (frame && data.height) {
                frame.style.height = data.height + 'px';
            } else {
                frame.style.height = "400px";
            }
        } else if (data.fnToCall === 'accountStatus' && data.status === 'SUCCESS') {
            if (opts.onSuccess && typeof opts.onSuccess === 'function') {
                opts.onSuccess(data);
            }
        } else if (data.fnToCall === 'errorHandler' || (data.fnToCall === 'accountStatus' && data.status === 'FAILED')) {
            if (opts.onError && typeof opts.onError === 'function') {
                opts.onError(data);
            }
        } else if (data.action === 'exit') {
            // if forceRedirect is true, let iframe url redirect
            if ((data.status != 'USER_CLOSE_ACTION' && forceRedirect) || !forceRedirect) {
                _close();
                if (opts.onClose && typeof opts.onClose === 'function') {
                    opts.onClose(data);
                }
            }
        } else {
            if (opts.onEvent && typeof opts.onEvent === 'function') {
                opts.onEvent(data);
            }
        }
    };

    var _createIFrame = function (parentElem) {
        var iframe = document.createElement('iframe');
        (iframe.frameElement || iframe).style.cssText = 'width:100%;border-width: 0px;display: block;height: 400px;';
        iframe.name = 'fl-frame';
        iframe.id = 'fl-frame';
        if (opts.containerClass) {
            iframe.setAttribute('class', opts.containerClass);
        }
        if (opts.iframeScrolling) {
            iframe.setAttribute('scrolling', opts.iframeScrolling);
        }
        var fastLinkDom = document.createElement('div');
        fastLinkDom.appendChild(iframe);
        opts.fastLinkDom = fastLinkDom;
        parentElem.appendChild(opts.fastLinkDom);
        return iframe;
    };

    var _isFLOpen = function () {
        if (mobileBrowser && newWindow && !newWindow.closed) {
            return true;
        } else if (!mobileBrowser && opts.fastLinkOpened) {
            return true;
        }
        return false;
    };

    var _createForm = function (opts, iframe) {

        var extraParamsVal = _prepareExtraParam(opts.params);

        var form = document.createElement('form');
        form.setAttribute('method', 'post');

        if (mobileBrowser) {
            newWindow = window.open('', 'fastlinkWindow');
            form.setAttribute('target', 'fastlinkWindow');
            if (!newWindow){
                throw new Error('Unable to open new pop up tab');
            }
            newWindow.focus();
        } else {
            form.setAttribute('target', iframe.name);
        }

        form.setAttribute('action', opts.fastLinkURL);

        var tokenInputElem = document.createElement('input');
        tokenInputElem.setAttribute('hidden', true);
        var tokenInputElemName = "";
        var tokenInputElemValue = "";
        if (opts.jwtToken) {
            tokenInputElemName = "jwtToken";
            tokenInputElemValue = opts.jwtToken;
        } else if (opts.accessToken) {
            tokenInputElemName = "accessToken";
            tokenInputElemValue = opts.accessToken;
        }

        if (opts.samlToken) {
            tokenInputElem.setAttribute('name', 'samlResponse');
            tokenInputElem.setAttribute('value', opts.samlToken);
            form.appendChild(tokenInputElem);

            var rsInputElem = document.createElement('input');
            rsInputElem.setAttribute('name', 'RelayState');
            rsInputElem.setAttribute('hidden', true);
            rsInputElem.setAttribute('value', opts.fastLinkURL);
            form.appendChild(rsInputElem);
        } else {
            tokenInputElem.setAttribute('name', tokenInputElemName);
            tokenInputElem.setAttribute('value', tokenInputElemValue);
            form.appendChild(tokenInputElem);

            var redirectInputElem = document.createElement('input');
            redirectInputElem.setAttribute('name', 'redirectReq');
            redirectInputElem.setAttribute('hidden', true);
            redirectInputElem.setAttribute('value', true);
            form.appendChild(redirectInputElem);
        }
        var extraParamsInputElem = document.createElement('input');
        extraParamsInputElem.setAttribute('name', 'extraParams');
        extraParamsInputElem.setAttribute('hidden', true);
        extraParamsInputElem.setAttribute('value', extraParamsVal);
        form.appendChild(extraParamsInputElem);

        document.body.appendChild(form);

        return {
            submitForm: function () {
                form.submit();
                //clean up form post html section, once iframe is ready
                var parentNode = form.parentNode;
                parentNode.removeChild(form);
                form = null;
            }
        };
    };

    var _prepareExtraParam = function (extraParams) {
        var extraParamsStr = '';
        if (!extraParams) {
            extraParams = {};
        } else if (typeof extraParams == 'string') {
            //convert string params to object
            extraParams = _convertToObject(extraParams);
        } else if (extraParams !== Object(extraParams)) {
            //handling extraParams as other primitive types such as number or true i.e. truethy values
            //also other types such as funtions
            extraParams = {};
        }
        extraParams.iframeResize = true;
        extraParams.fljsver = version ? version : 'v1';
        if (mobileBrowser) {
            extraParams.fwType = 'mb';  //mb=> mobile browser
        }
        extraParams.locationurl = window.location.href;
        var keys = Object.keys(extraParams);
        for (var i = 0; i < keys.length; i++) {
            if (typeof extraParams[keys[i]] == 'object') {
                extraParamsStr += encodeURIComponent(keys[i]) + '=' + encodeURIComponent(JSON.stringify(extraParams[keys[i]]));
            } else {
                extraParamsStr += encodeURIComponent(keys[i]) + '=' + encodeURIComponent(extraParams[keys[i]]);
            }
            if (i < keys.length - 1) {
                extraParamsStr += '&';
            }
        }
        return extraParamsStr;
    };

    var _convertToObject = function (extraParams) {
        var keyValuesObj = {};
        var keyValues = extraParams.split('&');
        for (var i = 0; keyValues && i < keyValues.length; i++) {
            var pair = keyValues[i].split('=');
            if (pair && pair.length >= 2) {
                keyValuesObj[pair[0]] = pair[1];
            }
        }
        return keyValuesObj;
    };

    var _htmlDecode = function (input) {
        var doc = new DOMParser().parseFromString(input, 'text/html');
        return doc.documentElement.textContent.replace(/(^")|("$)/g, '');
    };


    window.fastlink = {
        open: _open,
        close: _close
    };

})(window);
