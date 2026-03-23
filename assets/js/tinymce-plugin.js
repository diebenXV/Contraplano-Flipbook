/**
 * Plugin de TinyMCE para el botón del flipbook
 */
(function () {
    tinymce.PluginManager.add('flipbook_button', function (editor) {
        editor.addButton('flipbook_button', {
            title: 'Insertar Flipbook',
            icon: 'icon-flipbook',
            onclick: abrirDialogoFlipbook
        });

        function abrirDialogoFlipbook() {
            jQuery.ajax({
                url: flipbookButton.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'flipbook_get_list',
                    _ajax_nonce: flipbookButton.nonce
                },
                success: function(response) {
                    if (!response.success || !response.data.length) {
                        alert('No hay flipbooks disponibles. Por favor, crea uno primero.');
                        return;
                    }

                    // Crear opciones del select
                    let options = '<select id="flipbook-selector" style="width: 100%; padding: 8px; margin: 10px 0; font-size: 14px;">';
                    options += '<option value="">-- Selecciona un flipbook --</option>';

                    response.data.forEach(function (flipbook) {
                        options += '<option value="' + flipbook.id + '">' + flipbook.title + '</option>';
                    });

                    options += '</select>';

                    // Crear el diálogo
                    editor.windowManager.open({
                        title: 'Insertar Flipbook',
                        body: [
                            {
                                type: 'textbox',
                                name: 'content',
                                value: options,
                                multiline: false,
                                disabled: true
                            }
                        ],
                        buttons: [
                            {
                                text: 'Insertar',
                                onclick: function () {
                                    const id = jQuery('#flipbook-selector').val();

                                    if (!id) {
                                        alert('Por favor, selecciona un flipbook.');
                                        return;
                                    }

                                    const shortcode = '[contraplano_flipbook id="' + id + '"]';
                                    editor.insertContent(shortcode);
                                    editor.windowManager.close();
                                }
                            },
                            {
                                text: 'Cancelar',
                                onclick: 'close'
                            }
                        ]
                    });

                    // Reemplazar el campo de texto con el select
                    setTimeout(function () {
                        jQuery('.mce-textbox').html(options);
                    }, 100);
                },
                error: function () {
                    alert('Error al obtener la lista de flipbooks.');
                }
            });
        }
    });
})();
