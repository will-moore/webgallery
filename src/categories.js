//   Copyright (C) 2019 University of Dundee & Open Microscopy Environment.
//   All rights reserved.

//   This program is free software: you can redistribute it and/or modify
//   it under the terms of the GNU Affero General Public License as
//   published by the Free Software Foundation, either version 3 of the
//   License, or (at your option) any later version.

//   This program is distributed in the hope that it will be useful,
//   but WITHOUT ANY WARRANTY; without even the implied warranty of
//   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//   GNU Affero General Public License for more details.

//   You should have received a copy of the GNU Affero General Public License
//   along with this program.  If not, see <http://www.gnu.org/licenses/>.

// NB: SOURCE FILES are under /src. Compiled files are under /static/

// loaded below
let mapr_settings = {};

// Model for loading Projects, Screens and their Map Annotations
let model = new StudiesModel();


// ----- event handling --------

document.getElementById('maprConfig').onchange = (event) => {
  document.getElementById('maprQuery').value = '';
  let value = event.target.value.replace('mapr_', '');
  let placeholder = `Type to filter values...`;
  if (mapr_settings[value]) {
    placeholder = `Type ${ mapr_settings[value]['default'][0]}...`;
  }
  document.getElementById('maprQuery').placeholder = placeholder;
  // Show all autocomplete options...
  $("#maprQuery").focus();
  render();
}

document.getElementById('maprQuery').onfocus = (event) => {
  $("#maprQuery").autocomplete("search", event.target.value);
}

// ------ AUTO-COMPLETE -------------------

function showSpinner() {
  document.getElementById('spinner').style.visibility = 'visible';
}
function hideSpinner() {
  document.getElementById('spinner').style.visibility = 'hidden';
}

$("#maprQuery")
  .keyup(event => {
    if (event.which == 13) {
      let configId = document.getElementById("maprConfig").value;
      document.location.href = `search/?query=${ configId }:${ event.target.value }`;
    }
  })
  .autocomplete({
    autoFocus: false,
    delay: 1000,
    source: function( request, response ) {

        // if configId is not from mapr, we filter on mapValues...
        let configId = document.getElementById("maprConfig").value;
        if (configId.indexOf('mapr_') != 0) {

          let matches;
          if (configId === 'Name') {
            matches = model.getStudiesNames(request.term);
          } else {
            matches = model.getKeyValueAutoComplete(configId, request.term);
          }
          response(matches);
          return;
        }

        // Don't handle empty query for mapr
        if (request.term.length == 0) {
          return;
        }

        // Auto-complete to filter by mapr...
        configId = configId.replace('mapr_', '');
        let case_sensitive = false;

        let requestData = {
            case_sensitive: case_sensitive,
        }
        let url;
        if (request.term.length === 0) {
          // Try to list all top-level values.
          // This works for 'wild-card' configs where number of values is small e.g. Organism
          // But will return empty list for e.g. Gene
          url = `${ BASE_URL }mapr/api/${ configId }/`;
          requestData.orphaned = true
        } else {
          // Find auto-complete matches
          url = `${ BASE_URL }mapr/api/autocomplete/${ configId }/`;
          requestData.value = case_sensitive ? request.term : request.term.toLowerCase();
          requestData.query = true;   // use a 'like' HQL query
        }
        showSpinner();
        $.ajax({
            dataType: "json",
            type : 'GET',
            url: url,
            data: requestData,
            success: function(data) {
                hideSpinner();
                if (request.term.length === 0) {
                  // Top-level terms in 'maps'
                  if (data.maps && data.maps.length > 0) {
                    let terms = data.maps.map(m => m.id);
                    terms.sort();
                    response(terms);
                  }
                }
                else if (data.length > 0) {
                    response( $.map( data, function(item) {
                        return item;
                    }));
                } else {
                   response([{ label: 'No results found.', value: -1 }]);
                }
            },
            error: function(data) {
                hideSpinner();
                response([{ label: 'Error occured.', value: -1 }]);
            }
        });
    },
    minLength: 0,
    open: function() {},
    close: function() {
        // $(this).val('');
        return false;
    },
    focus: function(event,ui) {},
    select: function(event, ui) {
        if (ui.item.value == -1) {
          // Ignore 'No results found'
          return false;
        }
        // show temp message in case loading search page is slow
        $(this).val("loading search results...");
        // Load search page...
        let configId = document.getElementById("maprConfig").value;
        document.location.href = `search/?query=${ configId }:${ ui.item.value }`;
        return false;
    }
}).data("ui-autocomplete")._renderItem = function( ul, item ) {
    return $( "<li>" )
        .append( "<a>" + item.label + "</a>" )
        .appendTo( ul );
}

// ------------ Render -------------------------

function render() {
  document.getElementById('studies').innerHTML = "";

  let categories = Object.keys(CATEGORY_QUERIES);
   // Sort by index
  categories.sort(function(a, b) {
    let idxA = CATEGORY_QUERIES[a].index;
    let idxB = CATEGORY_QUERIES[b].index;
    return (idxA > idxB ? 1 : idxA < idxB ? -1 : 0);
  });

  // Link to the study in webclient...
  let linkFunc = (studyData) => {
    let type = studyData['@type'].split('#')[1].toLowerCase();
    return `${ BASE_URL }webclient/?show=${ type }-${ studyData['@id'] }`;
  }
  
  categories.forEach(category => {
    let cat = CATEGORY_QUERIES[category];
    let query = cat.query;

    // Find matching studies
    let matches = model.filterStudiesByMapQuery(query);
    if (matches.length == 0) return;

    let elementId = cat.label;

    var div = document.createElement( "div" );

    // If only ONE category...
    if (categories.length == 1) {
      // list studies in a grid, without category.label
      div.innerHTML = `<div id="${elementId}" class="row horizontal studiesLayout"></div>`;
    } else {
      div.innerHTML = `
        <h1 title="${query}" style="margin-left:10px">
          ${cat.label} (${ matches.length })
        </h1>
        <div class="category">
          <div id="${elementId}"></div>
        </div>
      `;
    }
    document.getElementById('studies').appendChild(div);

    matches.forEach(study => renderStudy(study, elementId, linkFunc));
  });

  // Now we iterate all Studies in DOM, loading image ID for link and thumbnail
  loadStudyThumbnails();
}


function renderStudy(studyData, elementId, linkFunc) {

  // Add Project or Screen to the page
  let title;
  for (let i=0; i<TITLE_KEYS.length; i++) {
    title = model.getStudyValue(studyData, TITLE_KEYS[i]);
    if (title) {
      break;
    }
  }
  if (!title) {
    title = studyData.Name;
  }
  let type = studyData['@type'].split('#')[1].toLowerCase();
  let studyLink = linkFunc(studyData);
  // save for later
  studyData.title = title;

  let desc = studyData.Description;
  let studyDesc;
  if (desc) {
    // If description contains title, use the text that follows
    if (title.length > 0 && desc.indexOf(title) > -1) {
      desc = desc.split(title)[1];
    }
    // Remove blank lines (and first 'Experiment Description' line)
    studyDesc = desc.split('\n')
      .filter(l => l.length > 0)
      .filter(l => l !== 'Experiment Description' && l !== 'Screen Description')
      .join('\n');
    if (studyDesc.indexOf('Version History') > 1) {
      studyDesc = studyDesc.split('Version History')[0];
    }
  }

  let shortName = getStudyShortName(studyData);
  let authors = model.getStudyValue(studyData, "Publication Authors") || "";

  // Function (and template) are defined where used in index.html
  let html = studyHtml({studyLink, studyDesc, shortName, title, authors, BASE_URL, type}, studyData)

  var div = document.createElement( "div" );
  div.innerHTML = html;
  div.className = "row study ";
  div.dataset.obj_type = type;
  div.dataset.obj_id = studyData['@id'];
  document.getElementById(elementId).appendChild(div);
}

// --------- Render utils -----------

function studyHtml(props, studyData) {
  let pubmed = model.getStudyValue(studyData, 'PubMed ID');
  if (pubmed) {
    pubmed = pubmed.split(" ")[1];
  };
  let author = props.authors.split(',')[0] || '';
  if (author) {
    author = `${ author } et al.`;
    author = author.length > 23 ? author.slice(0, 20) + '...' : author;
  }
  return `
  <div style='white-space:nowrap'>
    ${ props.shortName }
    ${ pubmed ? `<a class='pubmed' target="_blank" href="${ pubmed }"> ${ author }</a>` : author }
  </div>
  <div class="studyImage">
    <a target="_blank" href="${ props.studyLink }">
      <div style="height: 100%; width: 100%">
        <div class="studyText">
          <p title='${ props.studyDesc || '' }'>
            ${ props.title }
          </p>
        </div>
        <div class="studyAuthors">
          ${ props.authors }
        </div>
      </div>
    </a>
    <a class="viewerLink" title="Open image in viewer" target="_blank"
       href="">
      <i class="fas fa-eye"></i>
    </a>
  </div>
  `
}


function loadStudyThumbnails() {

  let ids = [];
  // Collect study IDs 'project-1', 'screen-2' etc
  $('div.study').each(function() {
    let obj_id = $(this).attr('data-obj_id');
    let obj_type = $(this).attr('data-obj_type');
    if (obj_id && obj_type) {
      ids.push(obj_type + '-' + obj_id);
    }
  });

  // Load images
  model.loadStudiesThumbnails(ids, (data) => {
    // data is e.g. { project-1: {thumbnail: base64data, image: {id:1}} }
    for (let id in data) {
      let obj_type = id.split('-')[0];
      let obj_id = id.split('-')[1];
      let elements = document.querySelectorAll(`div[data-obj_type="${obj_type}"][data-obj_id="${obj_id}"]`);
      for (let e=0; e<elements.length; e++) {
        // Find all studies matching the study ID and set src on image
        let element = elements[e];
        let studyImage = element.querySelector('.studyImage');
        studyImage.style.backgroundImage = `url(${ data[id].thumbnail })`;
        // viewer link
        let iid = data[id].image.id;
        let link = `${ BASE_URL }webclient/img_detail/${ iid }/`;
        element.querySelector('a.viewerLink').href = link;
      }
    }
  });
}

function renderStudyKeys() {
  if (FILTER_KEYS.length > 0) {
    let html = FILTER_KEYS
        .map(key => {
          if (key.label && key.value) {
            return `<option value="${ key.value }">${ key.label }</option>`
          }
          return `<option value="${ key }">${ key }</option>`
        })
        .join("\n");
    document.getElementById('studyKeys').innerHTML = html;
    // Show the <optgroup> and the whole form
    document.getElementById('studyKeys').style.display = 'block';
    document.getElementById('search-form').style.display = 'block';
  }
}
renderStudyKeys();


// ----------- Load / Filter Studies --------------------

// Do the loading and render() when done...
model.loadStudies(() => {
  // Immediately filter by Super category
  if (SUPER_CATEGORY && SUPER_CATEGORY.query) {
    model.studies = model.filterStudiesByMapQuery(SUPER_CATEGORY.query);
  }
  render();
});


// Load MAPR config
fetch(BASE_URL + 'mapr/api/config/')
  .then(response => response.json())
  .then(data => {
    mapr_settings = data;

    let options = FILTER_MAPR_KEYS.map(key => {
      let config = mapr_settings[key];
      if (config) {
        return `<option value="mapr_${ key }">${ config.label }</option>`;
      } else {
        return "";
      }
    });
    if (options.length > 0) {
      document.getElementById('maprKeys').innerHTML = options.join("\n");
      // Show the <optgroup> and the whole form
      document.getElementById('maprKeys').style.display = 'block';
      document.getElementById('search-form').style.display = 'block';
    }
  })
  .catch(function(err) {
      console.log("mapr not installed (config not available)");
  });