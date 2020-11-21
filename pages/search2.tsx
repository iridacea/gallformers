import { yupResolver } from '@hookform/resolvers/yup';
import { alignment, cells as dbcells, color, location, shape, texture, walls as dbwalls } from '@prisma/client';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { Col, ListGroup, Row } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import ControlledTypeahead from '../components/controlledtypeahead';
import { alignments, cells, colors, locations, shapes, textures, walls } from '../libs/db/gall';
import { allHostGenera, allHostNames } from '../libs/db/host';
import { mightBeNull } from '../libs/db/utils';
import { Gall, GallLocation, GallTexture, SearchQuery } from '../libs/types';

const dontCare = (o: string | string[] | undefined) => {
    const truthy = !!o;
    return !truthy || (truthy && Array.isArray(o) ? o?.length == 0 : false);
};

const checkLocations = (gallprops: GallLocation[] | null, queryvals: string[] | undefined): boolean => {
    if (gallprops == null || queryvals == undefined) return false;

    return gallprops.some((gp) => gp?.location?.location && queryvals.includes(gp?.location?.location));
};

const checkTextures = (gallprops: GallTexture[] | null, queryvals: string[] | undefined): boolean => {
    if (gallprops == null || queryvals == undefined) return false;

    return gallprops.some((gp) => gp?.texture?.texture && queryvals.includes(gp?.texture?.texture));
};

const checkGall = (g: Gall, q: SearchQuery): boolean => {
    const alignment = dontCare(q.alignment) || (!!g.alignment && g.alignment?.alignment === q.alignment);
    const cells = dontCare(q.cells) || (!!g.cells && g.cells?.cells === q.cells);
    const color = dontCare(q.color) || (!!g.color && g.color?.color === q.color);
    const detachable = dontCare(q.detachable) || (!!g.detachable && (g.detachable == 0 ? 'no' : 'yes') === q.detachable);
    const shape = dontCare(q.shape) || (!!g.shape && g.shape?.shape === q.shape);
    const walls = dontCare(q.walls) || (!!g.walls && g.walls?.walls === q.walls);
    const location = dontCare(q.locations) || (!!g.galllocation && checkLocations(g.galllocation, q.locations));
    const texture = dontCare(q.textures) || (!!g.galltexture && checkTextures(g.galltexture, q.textures));

    return alignment && cells && color && detachable && shape && walls && location && texture;
};

type SearchFormHostField = {
    host: string;
    genus?: never;
};

type SearchFormGenusField = {
    host?: never;
    genus: string;
};

type SearchFormFields = SearchFormHostField | SearchFormGenusField;

const Schema = yup.object().shape(
    {
        host: yup.string().when('genus', {
            is: '',
            then: yup.string().required('You must provide a search,'),
            otherwise: yup.string(),
        }),
        genus: yup.string().when('host', {
            is: '',
            then: yup.string().required('You must provide a search,'),
            otherwise: yup.string(),
        }),
    },
    [['host', 'genus']],
);

type Props = {
    hosts: string[];
    genera: string[];
    locations: location[];
    colors: color[];
    shapes: shape[];
    textures: texture[];
    alignments: alignment[];
    walls: dbwalls[];
    cells: dbcells[];
};

const Search2 = (props: Props): JSX.Element => {
    if (
        !props.hosts ||
        !props.genera ||
        !props.locations ||
        !props.colors ||
        !props.shapes ||
        !props.textures ||
        !props.alignments ||
        !props.walls ||
        !props.cells
    ) {
        throw new Error('Invalid props passed to Search.');
    }

    const router = useRouter();

    const [galls, setGalls] = useState(new Array<Gall>());
    const [query, setQuery] = useState(router.query as SearchQuery);

    // this is the search form on sepcies or genus
    const { control, setValue, handleSubmit, errors } = useForm({
        mode: 'onBlur',
        resolver: yupResolver(Schema),
    });

    // this is the faceted filter form
    const { control: filterControl, reset: filterReset } = useForm();

    const updateQuery = (f: string, v: string | string[]): SearchQuery => {
        const qq = { ...query } as SearchQuery;
        const value = f !== 'locations' && f !== 'textures' && v.length > 0 ? v[0] : v;
        (qq as Record<string, string | string[]>)[f] = value;
        return qq;
    };

    // this is the handler for changing either species or genus, it makes a DB round trip.
    const onSubmit = async ({ host, genus }: SearchFormFields) => {
        try {
            // make sure to clear all of the filters since we are getting a new set of galls
            filterReset();

            const query = host ? `?host=${host}` : `?genus=${genus}`;
            const res = await fetch(`../api/search${query}`, {
                method: 'GET',
            });

            if (res.status === 200) {
                setGalls(await res.json());
            } else {
                throw new Error(await res.text());
            }
        } catch (e) {
            console.error(e);
        }
    };

    // this is the handler for changing any other field, all work is done locally
    const doSearch = async (field: string, value: string | string[]) => {
        const newq = updateQuery(field, value);
        const filtered = galls.filter((g) => checkGall(g, newq));
        setGalls(filtered);
        setQuery(newq);
    };

    // keep TS happy since the allowable field values are bound when we set the defaultValues above in the useForm() call.
    type FilterFieldNames =
        | 'host'
        | 'genus'
        | 'locations'
        | 'detachable'
        | 'textures'
        | 'alignment'
        | 'walls'
        | 'cells'
        | 'shape'
        | 'color';

    const makeFormInput = (field: FilterFieldNames, opts: string[]) => {
        return (
            <ControlledTypeahead
                control={filterControl}
                name={field}
                onChange={(selected) => {
                    doSearch(field, selected);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        doSearch(field, e.currentTarget.value);
                    }
                }}
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                clearButton={field !== 'host'}
                options={opts}
                disabled={!(galls.length > 0)}
            />
        );
    };

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit)} className="fixed-left mt-2 ml-4 mr-2 form-group">
                <Row>
                    <Col>
                        <label className="col-form-label">Host:</label>
                        <ControlledTypeahead
                            control={control}
                            name="host"
                            onBlur={() => {
                                setValue('genus', '');
                            }}
                            placeholder="Host"
                            clearButton
                            options={props.hosts}
                        />
                    </Col>
                    <Col xs={1} className="align-self-center">
                        - or -
                    </Col>
                    <Col>
                        <label className="col-form-label">Genus:</label>
                        <ControlledTypeahead
                            control={control}
                            name="genus"
                            onBlur={() => {
                                setValue('host', '');
                            }}
                            placeholder="Genus"
                            clearButton
                            options={props.genera}
                        />
                    </Col>
                </Row>
                <Row>
                    <Col>
                        {errors.host && (
                            <span className="text-danger">
                                You must provide a search selection, either a Host species or genus.
                            </span>
                        )}
                    </Col>
                </Row>
                <Row>
                    <Col className="pt-2">
                        <input type="submit" value="Search" className=" btn btn-secondary" />
                    </Col>
                </Row>
            </form>
            <Row>
                <Col xs={3}>
                    <form className="fixed-left ml-4 form-group">
                        <label className="col-form-label">Location:</label>
                        {makeFormInput(
                            'locations',
                            props.locations.map((l) => mightBeNull(l.location)),
                        )}
                        <label className="col-form-label">Detachable:</label>
                        {makeFormInput('detachable', ['yes', 'no', 'unsure'])}
                        <label className="col-form-label">Texture:</label>
                        {makeFormInput(
                            'textures',
                            props.textures.map((t) => mightBeNull(t.texture)),
                        )}
                        <label className="col-form-label">Aligment:</label>
                        {makeFormInput(
                            'alignment',
                            props.alignments.map((a) => mightBeNull(a.alignment)),
                        )}
                        <label className="col-form-label">Walls:</label>
                        {makeFormInput(
                            'walls',
                            props.walls.map((w) => mightBeNull(w.walls)),
                        )}
                        <label className="col-form-label">Cells:</label>
                        {makeFormInput(
                            'cells',
                            props.cells.map((c) => mightBeNull(c.cells)),
                        )}
                        <label className="col-form-label">Shape:</label>
                        {makeFormInput(
                            'shape',
                            props.shapes.map((s) => mightBeNull(s.shape)),
                        )}
                        <label className="col-form-label">Color:</label>
                        {makeFormInput(
                            'color',
                            props.colors.map((c) => mightBeNull(c.color)),
                        )}
                    </form>
                </Col>
                <Col className="mt-2 form-group mr-4">
                    {/* <Row className='border m-2'><p className='text-right'>Pager TODO</p></Row> */}
                    <Row className="m-2">
                        <ListGroup>
                            {galls.length == 0 ? (
                                query.host == undefined ? (
                                    <h4 className="font-weight-lighter">
                                        To begin with select a Host or a Genus to see matching galls. Then you can use the filters
                                        on the left to narrow down the list.
                                    </h4>
                                ) : (
                                    <h4 className="font-weight-lighter">There are no galls that match your filter.</h4>
                                )
                            ) : (
                                galls.map((g) => (
                                    <ListGroup.Item key={g.species_id}>
                                        <Row key={g.id}>
                                            <Col xs={2} className="">
                                                <img
                                                    src="images/gall.jpg"
                                                    width="75px"
                                                    height="75px"
                                                    className="img-responsive"
                                                />
                                            </Col>
                                            <Col className="pl-0 pull-right">
                                                <Link href={`gall/${g.species_id}`}>
                                                    <a>{g.species?.name}</a>
                                                </Link>
                                                - {gallDescription(g)}
                                            </Col>
                                        </Row>
                                    </ListGroup.Item>
                                ))
                            )}
                        </ListGroup>
                    </Row>
                </Col>
            </Row>
        </>
    );
};

const gallDescription = (g: Gall): string => {
    if (g.species && g.species.description) {
        if (g.species.description.length > 400) {
            return g.species.description.slice(0, 400) + '...';
        } else {
            return g.species.description;
        }
    }
    return '';
};

export const getServerSideProps: GetServerSideProps = async () => {
    // get all of the data for the typeahead boxes
    return {
        props: {
            hosts: await allHostNames(),
            genera: await allHostGenera(),
            locations: await locations(),
            colors: await colors(),
            shapes: await shapes(),
            textures: await textures(),
            alignments: await alignments(),
            walls: await walls(),
            cells: await cells(),
        },
    };
};

export default Search2;