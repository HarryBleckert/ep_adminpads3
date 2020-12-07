# Administrate Etherpads
===========

![Screen shot](docs/img/preview.png)

Etherpad plugin for admins to list, search, and delete pads. The route
is `admin/pads`.

New features on Dec. 07, 2020
- New columns: Pad size, No. of revisions
- Pads are sorted: Default sorting: Last Edited, descending
  All columns can be sorted descending or ascending by clicking on column headers
- Animated "Loading.." Icon


To be Done:
- Currently up to 35,000 pads can be handled. On re-sorting padManager.listAllPads() ist called again.
  This should only happen a single time on startup.
- Automatic Updates on pad changes don't work and the checkbox has been temporarily disabled.

This is a fork of
[ep_adminpads](https://github.com/spcsser/ep_adminpads), which is no
longer maintained.
