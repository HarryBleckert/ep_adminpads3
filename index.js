
/**
 *
 * @package   ep_adminpoads3
 * @copyright 2021 onwards ASH Berlin {@link https://ASH-Berlin.eu}
 * @license   https://www.gnu.org/licenses/gpl-3.0.html GNU GPL v3 or later
 * @author    Harry@Bleckert.com
 */

'use strict';

const $ = require('cheerio').load('');
const eejs = require('ep_etherpad-lite/node/eejs');
const padManager = require('ep_etherpad-lite/node/db/PadManager');
const api = require('ep_etherpad-lite/node/db/API');

let ioNs = null;

// Sorting requires all pads to be loaded and analyzed.
// Todo: Retrieve all Pads only 1 time and update only new or edited pads in stored array.
const queryLimit = 36000;

const isNumeric = (arg) => typeof arg === 'number' || (typeof arg === 'string' && parseInt(arg));
const regExpQuote = (x) => x.toString().replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&');

const search = async (query) => {
  const {padIDs} = await padManager.listAllPads();
  const data = {
    progress: 1,
    messageId: 'ep_adminpads3_search-done',
    query,
    total: padIDs.length,
  };
  let maxResult; // =0;
  let result = padIDs;
  if (query.pattern != null && query.pattern !== '') {
    let pattern = `*${query.pattern}*`;
    pattern = regExpQuote(pattern);
    pattern = pattern.replace(/(\\\*)+/g, '.*');
    pattern = `^${pattern}$`;
    const regex = new RegExp(pattern, 'i');
    result = result.filter(regex.test.bind(regex));
  }

  // get Etherpad instance Statistics - no results receivedd - omitted for now
  // data.Stats = api.getStats();

  data.total = result.length;

  maxResult = result.length - 1;
  if (maxResult < 0) {
    maxResult = 0;
  }

  if (!isNumeric(query.offset) || query.offset < 0) {
    query.offset = 0;
  } else if (query.offset > maxResult) {
    query.offset = maxResult;
  }

  if (!isNumeric(query.limit) || query.limit < 0) {
    query.limit = queryLimit;
  }

  // data.results = result.map((padName) => ({padName, lastEdited: '', userCount: 0}));
  // const rs = result.slice(query.offset, query.offset + query.limit);
  // we do not slice pad list anymore
  const rs = result;
  data.results = rs.map((padName) => ({padName, lastEdited: '', userCount: 0, revisions: 0, padSize: 0}));


  if (!data.results.length) data.messageId = 'ep_adminpads3_no-results';
  await Promise.all(data.results.map(async (entry) => {
    const pad = await padManager.getPad(entry.padName);
    entry.userCount = api.padUsersCount(entry.padName).padUsersCount;
    entry.lastEdited = await pad.getLastEdit();
    entry.revisions = await pad.getHeadRevisionNumber(); //pad.savedRevisions.length;
    entry.padSize = await pad.text().length;
  }));

  const sorted = data.results.sort((a, b) => a.lastEdited - b.lastEdited);
  data.results = sorted.slice(query.offset, query.offset + query.limit);

  return data;
};

exports.expressCreateServer = (hookName, {app}, cb) => {
  app.get('/admin/pads', (req, res) => {
    res.send(eejs.require('ep_adminpads3/templates/admin/pads.html', {errors: []}));
  });
  return cb();
};

exports.socketio = (hookName, {io}, cb) => {
  ioNs = io.of('/pluginfw/admin/pads');
  ioNs.on('connection', (socket) => {
    const _search = async (query) => {
      try {
        const result = await search(query);
        socket.emit('search-result', result);
      } catch (err) {
        socket.emit('search-error', err.stack ? err.stack : err.toString());
      }
    };
    socket.on('load', () => _search({pattern: '', offset: 0, limit: queryLimit}));
    socket.on('search', _search);

    socket.on('delete', async (padId) => {
      const padExists = await padManager.doesPadExists(padId);
      if (padExists) {
        // pad exists, remove it
        const pad = await padManager.getPad(padId);
        // Jan 24: Problem with postgresql: pads disappear in view, but not from database!!!
        // see https://github.com/HarryBleckert/ep_adminpads3/issues/14#issuecomment-1879572582
        // socket.emit('delete', padId);
        await pad.remove();
        socket.emit('progress', {progress: 1});
      }
    });
  });
  return cb();
};

const updatePads = (hookName, context, cb) => {
  ioNs.emit('progress', {progress: 1});
  return cb();
};

exports.padRemove = updatePads;
exports.padCreate = updatePads;

exports.eejsBlock_adminMenu = (hookName, context, cb) => {
  const ul = $('<ul>').html(context.content);
  const pfx = ul.find('li a').attr('href').match(/^((?:\.\.\/)*)/)[1];
  ul.append(
      $('<li>').append(
          $('<a>')
              .attr('href', `${pfx}pads`)
              .attr('data-l10n-id', 'ep_adminpads3_manage-pads')
              .text('Manage pads')));
  context.content = ul.html();
  return cb();
};
// const regExpQuote = (x) => x.toString().replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&');
