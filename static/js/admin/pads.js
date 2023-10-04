/**
 *
 * @package   ep_adminpoads3
 * @copyright 2021 onwards ASH Berlin {@link https://ASH-Berlin.eu}
 * @license   https://www.gnu.org/licenses/gpl-3.0.html GNU GPL v3 or later
 * @author    Harry@Bleckert.com
 */

/**
 *
 * ToDos:
 * - fix AutoUpdate. It doesn't work, disabled in pads.html
 * - find better solution to sort only single time and allow re-using result array
 * - Add pluginUrl to etherpad settings and retrieve from there or configure.
 */

/* global _ */

'use strict';

$(() => {
  let query = {
    pattern: '',
    offset: 0,
    limit: 36000,
  };
  let total;

  const queryFreq = 1000; // 1 second wait for query update
  const urlParams = new URLSearchParams(window.location.search);

  const basePath = location.pathname.split('/').slice(0, -2).join('/'); // Strip /admin/plugins.
  const socketioPath = `${basePath}/socket.io`;
  // Note: The socket.io URL should not contain ${basePath} because the path part of this URL is
  // used as the socket.io namespace.
  const socketioUrl = `${location.protocol}//${location.host}/pluginfw/admin/pads`;

  const socket = io.connect(socketioUrl, {path: socketioPath});

  let changeTimer;

  let doUpdate = false;
  const doAutoUpdate = () => $('#results-autoupdate').prop('checked');

  const search = () => {
    clearTimeout(changeTimer);
    socket.emit('search', query);
  };

  const submitSearch = () => {
    query.pattern = $('#search-query')[0].value;
    query.offset = 0;
    search();
  };

  /*
  const formatDate = (longtime) => (new Date(longtime)).toLocaleString(undefined, {

    dateStyle: 'short',
    timeStyle: 'long',
  });
   */
  const isInt = (input) => typeof input === 'number' && input % 1 === 0;

  const formatDate = (longtime) =>
    // return (new Date(longtime)).toLocaleString(undefined, {
    (new Date(longtime)).toLocaleString('de-DE', {
      dateStyle: 'short',
      timeStyle: 'long',
    });
  const fillZeros = (x) => isInt(x) ? (x < 10 ? '0{x}' : x) : '';

  const updateHandlers = () => {
    $('#progress.dialog .close').off('click').click(() => $('#progress.dialog').hide());

    $('#search-form').off('submit').on('submit', (e) => {
      e.preventDefault();
      submitSearch();
    });

    $('#do-search').off('click').click(submitSearch);

    // $('#search-query').off('change paste keyup').on('change paste keyup', (e) => {
    $('#search-query').off('change paste keyup').on('change paste keyup', (e) => {
      clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        e.preventDefault();
        submitSearch();
      }, queryFreq); // 500
    });

    $('.do-delete').off('click').click((e) => {
      const row = $(e.target).closest('tr');
      const padID = row.find('.padname').text();
      if (confirm(_('ep_adminpads3_confirm', {padID}) ||
                  `Do you really want to delete the pad ${padID}?`)) {
        doUpdate = true;
        socket.emit('delete', padID);
      }
    });

    $('#do-first-page').off('click').click((e) => {
      query.offset = 0;
      search();
    });
    $('#do-prev-page').off('click').click((e) => {
      query.offset -= query.limit;
      if (query.offset < 0) query.offset = 0;
      search();
    });
    $('#do-next-page').off('click').click((e) => {
      if (query.offset + query.limit < total) {
        query.offset += query.limit;
      }
      search();
    });
    $('#do-last-page').off('click').click((e) => {
      query.offset = total - query.limit;
      if (query.offset <0) {
        query.offset = 0;
      }
      search();
    });
  };

  updateHandlers();

  socket.on('progress', (data) => {
    $('#progress .close').hide();
    $('#progress').show();

    $('#progress').data('progress', data.progress);

    const message = $('<span>');
    if (data.isError) {
      message.addClass('error');
      message.text(_(data.messageId) || _('ep_adminpads3_unknown-error') || 'Unknown error');
    } else {
      message.addClass('status');
      message.text(_(data.messageId) || _('ep_adminpads3_unknown-status') || 'Unknown status');
    }
    $('#progress .message').empty().append(message);

    if (data.progress >= 1) {
      if (data.isError) {
        $('#progress').show();
      } else {
        if (doUpdate || doAutoUpdate()) {
          doUpdate = false;
          search();
        }
        $('#progress').hide();
      }
    }
  });

  socket.on('search-result', (data) => {
    let limit = data.query.offset + data.query.limit;
    if (limit > data.total) {
      limit = data.total;
    }

    query = data.query;
    total = data.total;

    $('#offset').text(query.offset);
    $('#limit').text(limit);
    $('#total').text(total);

    if (data.results.length > 0) {
      $('#loading').hide();
      $('#no-results').hide();
      $('#error').hide();
      const resultList = $('#results').empty();

      let sortBy = 'lastEdited';
      const sortTags = ['padName', 'lastEdited', 'userCount', 'padSize', 'revisions'];
      const sortParam = urlParams.get('sortby');
      if (sortParam && (sortTags.indexOf(sortParam) > -1)) { sortBy = sortParam; }
      let descending = true;
      if (Cookies.get('descending') === 'false') { descending = false; }
      if (Cookies.get('sortBy') === sortBy && sortParam) { descending = !descending; } else { descending = true; }
      Cookies.set('sortBy', sortBy);
      Cookies.set('descending', descending);
      if (sortBy == 'padName') { descending = !descending; }

      data.results = data.results.slice(0);
      if (descending) {
        data.results.sort((a, b) => {
          if (sortBy == 'padName') { return b.padName.localeCompare(a.padName); }
          return b[sortBy] - a[sortBy];
        });
      } else {
        data.results.sort((a, b) => {
          if (sortBy == 'padName') { return a.padName.localeCompare(b.padName); }
          return a[sortBy] - b[sortBy];
        });
      }

      let activeusers = 0;
      let padSizeTotal = 0;
      let changedToday = 0;
      const last24 = Math.floor(Date.now() / 1000) - 86400;
      let ashpath = '/data/var/www/moodle_production/mod/etherpadlite';
      let pluginUrl = '../p/';
      /*if (fs.existsSync(ashpath)) {
        pluginUrl = 'https://moodle.ash-berlin.eu/mod/etherpadlite/view.php?pad=';
      }
      */
      // sortedResults.forEach((resultset) => {
      data.results.forEach((resultset) => {
        const {padName, lastEdited, userCount, padSize, revisions} = resultset;
        const row = $('#template').clone().removeAttr('id');

        row.find('.padname').empty().append($('<a target="pad">').attr('href',
            `${pluginUrl}${encodeURIComponent(padName)}`).text(padName));
        row.find('.last-edited').text(formatDate(lastEdited));
        row.find('.Size').text(padSize.toLocaleString('de-DE'));
        row.find('.Revisions').text(revisions); // .toLocaleString("de-DE"));
        row.find('.user-count').text(userCount);
        resultList.append(row);
        activeusers += userCount;
        padSizeTotal += padSize;
        if (Math.floor(lastEdited / 1000) >= last24) { changedToday += 1; }
      });
      $('#activeusers').text(activeusers.toLocaleString('de-DE'));
      $('#padsizetotal').text(padSizeTotal.toLocaleString('de-DE'));
      // $('#results-autoupdate').prop('checked') = doAutoUpdate();
      $('#pad-widget').show();
      // statistics
      $('#totalPads').text(total); // text(data.Stats.totalPads);
      $('#changedToday').text(changedToday);
      // $('#totalSessions').text(data.Stats.totalSessions);
      // $('#activePads').text(data.Stats.totalActivePads)

      const sortCol = $(`#${sortBy}`).text();
      const arrow = descending ? ' &darr;' : ' &uarr;';
      $(`#${sortBy}`).html(`<i>${sortCol}</i>${arrow}`);
    } else {
      $('#loading').hide();
      $('#pad-widget').hide();
      $('#error').hide();
      $('#no-results').show();
    }

    updateHandlers();
  });

  socket.on('search-error', (err) => {
    $('#loading').hide();
    $('#pad-widget').hide();
    $('#no-results').hide();
    $('#error-title')
        .attr('data-l10n-id', 'ep_adminpads3_search-error-title')
        .text('Failed to get pad list');
    $('#error-explanation')
        .attr('data-l10n-id', 'ep_adminpads3_search-error-explanation')
        .text('The server encountered an error while searching for pads:');
    $('#error-message').text(err.toString());
    $('#error').show();
  });

  socket.emit('load');
});
