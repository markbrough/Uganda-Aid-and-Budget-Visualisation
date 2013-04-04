var OpenSpending = OpenSpending || {};
/*
    Abstract the WDMMG data store (accessed via its api).
    Sample use:
    
    var datastore = WDMMG.Datastore(other_config);
    datastore.list("entries", function(data){...});
    datastore.listEntries(function(data){...});
    datastore.filterDataset({key: value, foo: bar}, function(data){...});
    
*/

(function($) {
  var defaultConfig = {
    'endpoint': 'http://localhost:5000/'
  };

  OpenSpending.Datastore = function(customConfig) {
    var breakdown = {},
        keys = {},
        resources = ["Entry", "Entity", "Classifier", "Dataset"],
        resourceOperations = ["list", "get", "filter", "distinct"],
        CLB = "?callback=?";
    
    var d = {
        getData: function(path, data, callback){
            return $.ajax({
              url: this.config.endpoint + path + CLB,
              dataType: 'json',
              data: data,
              success: callback,
              cache: true
            });
        },
        config: customConfig || defaultConfig,
        list: function(resource, callback){
            this.getData(resource, {}, callback);
        },
        get: function(resource, objectId, callback){
            this.getData(resource + "/" + objectId, {}, callback);
        },
        filter: function(resource, filters, callback){
            this.getData(resource, filters, callback);
        },
        distinct: function(resource, key, filters, callback){
            this.getData(resource + "/distinct/" + key, filters, callback);
        },
        aggregate: function(slice, breakdownKeys, callback) {
            var breakdown = {"slice": slice},
                keys = [];
            if (breakdownKeys){
                keys = breakdownKeys.slice();
            }
            // sort the keys as order does not matter for aggregation
            // canonical string for cache?
            keys.sort();

            for (var i=0; i< keys.length; i++){
                breakdown["breakdown-"+keys[i]] = "yes";
            }
            // probably better API URL:
            // $.getJSON(this.config+resource+"/aggregate"+CLB, breakdown, callback);
            this.getData("api/aggregate", breakdown, callback);
        }
    };
    
    /* Curry fancy shortcut methods like getEntry, filterClassifier etc. */
    for(var i=0; i<resources.length; i++){
        for (var j=0; j<resourceOperations.length; j++){
            (function(resource, operation){
                d[operation+resource] = function(){
                    return d[operation].apply(d, [resource.toLowerCase()].concat(Array.prototype.slice.call(arguments)));
                };
            }(resources[i], resourceOperations[j]));
        }
    }
    return d;
  };


  // Javascript library for OpenSpending search.
  //
  // OpenSpending's search interface mimics that of Solr, see
  // http://openspending.org/api.
  //
  // This JS library's API is therefore also similar to Solr.
  //
  // Simple usage example can be found in app/spend-browser
  OpenSpending.Search = function(config) {
    my = {};
    my._config = config || defaultConfig;
    // deep copy so we don't mess with common config
    my._config = $.extend(true, {}, my._config);
    my._config.searchApi = my._config.endpoint + 'api/search';

    // slight hack here is AjaxSolr expects base solr url and then appends servlet (defaults to 'select')
    my.Manager = new AjaxSolr.Manager({
      servlet: ''
    });
    my.Manager.solrUrl = my._config.searchApi;

    my.search = function(params) {
      _params = $.extend(true, {}, params);
      _params.q = _params.q || '';
      if ('qparams' in _params) {
        for (var k in _params.qparams) {
          _params.q += ' ' + k + ':' + _params.qparams[k];
        }
      }
      delete _params['qparams'];
      for (var name in _params) {
        my.Manager.store.addByValue(name, _params[name]);
      }
      my.Manager.doRequest();
    };

    my.entryUrl = function(entry) {
      if ('name' in entry) {
        var entry_id = entry.name;
      } else {
        var entry_id = entry.id;
      }
      return my._config.endpoint + 'ugandabudget/entries/' + entry_id;
    };

    my.entityUrl = function(entity) {
      if ('name' in entity) {
        var entity_id = entity.name + '/entries';
      } else {
        var entity_id = entity.id;
      }
      return my._config.endpoint + 'ugandabudget/from/' + entity_id + '?q=time.year%3A' + parent.year;
    };

    my.entityLink = function(entity) {
      var out = $('<div />').text(entity.label_facet).html();
      return out
    };

    my.swgShow = function(entity) {
      var out = $('<div />').text(entity.label_facet).html();
      return out
    };
    
    my.projectShow = function(projectname) {
        if (projectname.label_facet != '') {
            var out = projectname.label_facet;
            out = out + '<br /><span class="progproj">Project</span>';
        } else {
            var out = "";
        }
        return out;
    }
    
    my.programmeShow = function(entity) {
        if (entity.label_facet != '(Undefined)') {
            var out = entity.label_facet;
            out = out + '<br /><span class="progproj">Programme</span>';
        } else {
            var out = "";
        }
        return out;
    }

   my.sectorobjectiveShow = function(entity) {
      var out = $('<div />').text(entity.label_facet).html();
      return out
    };

    my.formatCurrency = function(currency) {
      if(currency == 'GBP') {
        return '&pound;';
      } else if (currency == 'USD') {
        return '$';
      } else if (currency == 'EUR') {
        return '&euro;';
      } else {
        return currency;
      }
    }

    my.ResultWidget = AjaxSolr.AbstractWidget.extend({
      init: function () {
        this.$target = $(this.target);
        this.$messages = this.$target.find('.messages');
        this.$resultlist = this.$target.find('.result-list');
      },

      beforeRequest: function () {
        this.$messages.html($('<img/>').attr('src', 'http://assets.okfn.org/images/icons/ajaxload-circle.gif'));
      },

      afterRequest: function () {
        var self = this;
        this.$messages.empty();
        var data = this.manager.response;

        this.$target.find('.num-entries span').html(data.response.numFound + ' projects found in ' + searchtext);

        // unflatten entries from solr response
        var entries = $.map(data.response.docs, function(item, idx) {
          // deep copy
          var entry = $.extend(true, {}, item);
          entry.from = {};
          entry.to = {};
          entry.sector = {};
          entry.subsector = {};
          entry.programme = {};
          entry.aid_programme = {};
          entry.project = {};
          for (key in item) {
            if (key.indexOf('from.') === 0) {
              entry.from[key.slice(5)] = item[key];
            }
            if (key.indexOf('to.') === 0) {
              entry.to[key.slice(3)] = item[key];
            }
            if (key.indexOf('sector.') === 0) {
              entry.sector[key.slice(7)] = item[key];
            }
            if (key.indexOf('subsector.') === 0) {
              entry.subsector[key.slice(10)] = item[key];
            }
            if (key.indexOf('programme.') === 0) {
              entry.programme[key.slice(10)] = item[key];
            }
            if (key.indexOf('aid_programme_name.') === 0) {
              entry.aid_programme[key.slice(19)] = item[key];
            }
            if (key.indexOf('project_name.') === 0) {
              entry.project[key.slice(13)] = item[key];
            }
          }
          return entry;
        });
        var out = $.tmpl(this.tmplEntriesList, {docs: entries});
        this.$resultlist.empty().append(out);

        // Sorting ...
        var headers = this.$resultlist.find('table thead th');
        var currentSort = self.manager.store.values('sort');
        var sortCSS = ['sort-asc', 'sort-desc'];
        headers.removeClass(sortCSS);
        $.each(currentSort, function(idx, item) {
          var parts = item.split(' ');
          self.$resultlist.find('th[column="' + parts[0] + '"]').addClass('sort-' + parts[1]);
          });
        headers.click(function(e) {
	  if ($(e.target).hasClass('sortable')) {
	          var _el = $(e.target);
	          var sortCol = _el.attr('column');
	          // set sort direction
	          var sortDirection = 'desc'
	          $.each(currentSort, function(idx, item) {
	            var parts = item.split(' ');
	            // is current sort direction for this col desc?
	            if (parts[0] == sortCol && parts[1] == 'desc') {
	              sortDirection = 'asc';
	            }
	          });
	          self.manager.store.addByValue('sort', sortCol + " " + sortDirection);
	          self.manager.doRequest();
	  }
        });
      },

      tmplEntriesList: ' \
        <table> \
          <thead> \
            <tr> \
              <th column="from.label_facet" class="sortable">Spender</th> \
              <th column="sector.label_facet" class="sortable">Sector</th> \
              <th column="subsector.label_facet" class="sortable">Subsector</th> \
              <th column="project_programme.label_facet">Title</th> \
              <th column="amount" class="num sortable">Amount</th> \
              <th>&nbsp;</th> \
            </tr> \
          </thead> \
          <tbody> \
            {{each(index, entry) docs}} \
            <tr> \
              <td class="{{html entry.spending_source_type}}"> \
                {{html my.entityLink(entry.from)}} \
              </td> \
              <td> \
                {{html my.swgShow(entry.sector)}} \
              </td> \
              <td> \
                {{html my.sectorobjectiveShow(entry.subsector)}} \
              </td> \
              <td> \
                {{html my.programmeShow(entry.programme)}} {{html my.projectShow(entry.project)}}  \
              </td> \
              <td class="num"> \
                USD ${OpenSpending.Utils.formatAmountWithCommas(entry.amount, 2)} \
              </td> \
              <td> \
                <a href="${my.entryUrl(entry)}" target="_blank">more &raquo;</a> \
              </td> \
            </tr> \
            {{/each}} \
          </tbody> \
          <tfoot> \
            <tr> \
              <th colspan="5"> \
                <div class="pager"> \
                </div> \
              </th> \
            </tr> \
          </tfoot> \
        </table> \
        '
    });

    my.PagerWidget = AjaxSolr.PagerWidget.extend({
      innerWindow: 2,
      outerWindow: 1,
      renderHeader: function (perPage, offset, total) {
        $('#pager-header').html($('<span/>').text('displaying ' + Math.min(total, offset + 1) + ' to ' + Math.min(total, offset + perPage) + ' of ' + total));
      },
      renderLinks: function(links) {
        if (this.totalPages) {
          links.unshift(this.pageLinkOrSpan(this.previousPage(), [ 'pager-disabled', 'pager-prev' ], this.prevLabel));
          links.push(this.pageLinkOrSpan(this.nextPage(), [ 'pager-disabled', 'pager-next' ], this.nextLabel));

          var res = $('<ul />');
          $.each(links, function(idx, link) {
            var _li = $('<li />');
            _li.append(link);
            res.append(_li);
            });
          $(this.target).append(res);
        }
      }
    });

    // Provides drop down selection box based on facet field
    my.DropDownFacetWidget = AjaxSolr.AbstractFacetWidget.extend({
      afterRequest: function() {
        if (this.manager.response.facet_counts.facet_fields[this.field] === undefined) {
            $(this.target).html('No items found');
            return;
          }

        var maxCount = 0;
        var objectedItems = [
          {
            facet: '--All--',
            count: this.manager.response.response.numFound
          }
        ];
        for (var facet in this.manager.response.facet_counts.facet_fields[this.field]) {
          var count = parseInt(this.manager.response.facet_counts.facet_fields[this.field][facet]);
          objectedItems.push({ facet: facet, count: count });
        }

        $(this.target).empty();
        var _t = $(this.target);
        _t.append('<h4>Filter by ' + this.id.slice(0,1).toUpperCase() + this.id.slice(1) + '</h4>');
        var select = $('<select name="' + this.id + '"></select>');
        var _tmpl = '<option value="${facet}">${facet} (${count})</option>';
        var out = $.tmpl(_tmpl, objectedItems);
        select.append(out);
        _t.append(select);
        var self = this;
        select.change(function(e) {
          meth = self.multivalue ? 'add' : 'set';
          var value = $(e.target).attr('value');
          if (self[meth].call(self, value)) {
            self.manager.doRequest(0);
          }
        });
      }
    });

    my.CurrentSearchWidget =  AjaxSolr.AbstractWidget.extend({
      afterRequest: function () {
        var self = this;
        var links = [];

        var fq = this.manager.store.values('fq');

        var data = $.map(fq, function(facet, idx) {
          return {
            facet: facet,
            name: facet.split(':')[1]
            };
        });
        var tmpl = '<a href="#${name}" facet="${facet}">[x] ${name}</a>';
        $(this.target).html($.tmpl(tmpl, data));
        if (fq.length == 0) {
          $(this.target).html('<div>No filters applied.</div>');
        }
        var self = this;
        $('.filters-current .list a').click(function(e) {
          e.preventDefault();
          facet = $(e.target).attr('facet');
          if (self.manager.store.removeByValue('fq', facet)) {
            self.manager.doRequest(0);
          }
        });
      },

      removeFacet: function (facet) {
        var self = this;
        return function () {
          if (self.manager.store.removeByValue('fq', facet)) {
            self.manager.doRequest(0);
          }
          return false;
        };
      }
    });

    return my;
  }

}(jQuery));


